import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrBriefResponse, type LLMProvider, type StructuredRequest, type StructuredResult } from '@devdigest/shared';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { BriefRepository } from '../src/modules/brief/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
// A non-test NODE_ENV registers the global rate-limit plugin, which the per-route POST limit rides on.
const config = (nodeEnv: 'test' | 'development' = 'test') =>
  loadConfig({ ...process.env, NODE_ENV: nodeEnv } as NodeJS.ProcessEnv);

const OUTPUT = {
  summary: 'Adds a rate limiter.',
  risks: [{ kind: 'security', title: 'Bypass', explanation: 'Header spoof.', severity: 'high', file_refs: ['src/a.ts:1-3'] }],
  review_focus: [{ file: 'src/a.ts', line: 2, reason: 'Check the limiter.' }],
};

/** Fail-fast stand-in for providers a test must not reach (a machine with a real key would pay). */
class FakeLlm implements LLMProvider {
  readonly id = 'openrouter' as unknown as LLMProvider['id'];
  calls = 0;
  constructor(private err?: Error) {}
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('unexpected complete()');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls += 1;
    if (this.err) throw this.err;
    return { data: OUTPUT as T, model: req.model, tokensIn: 700, tokensOut: 90, costUsd: 0.002, raw: '', attempts: 1 };
  }
  async embed(): Promise<number[][]> {
    throw new Error('unexpected embed()');
  }
}

d('brief module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  const db = () => pg.handle.db;

  // blast degrades fail-soft on this facade (every method throws), which the brief records as missing
  const repoIntel = new Proxy({}, { get: () => async () => { throw new Error('repo-intel offline'); } }) as unknown as RepoIntel;

  const appWith = (llm: FakeLlm, nodeEnv: 'test' | 'development' = 'test') =>
    buildApp({
      config: config(nodeEnv),
      db: db(),
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        repoIntel,
        llm: {
          // risk_brief defaults to openai; every other provider the flow could reach fails fast
          openai: llm,
          openrouter: new FakeLlm(new Error('openrouter must not be reached')),
          anthropic: new FakeLlm(new Error('anthropic must not be reached')),
        },
      },
    });

  const newRepo = async (ws = workspaceId) => {
    const name = `brief-${seq++}`;
    const [r] = await db()
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}`, clonePath: null })
      .returning();
    return r!;
  };

  const newPull = async (opts: { ws?: string; files?: boolean; headSha?: string } = {}) => {
    const ws = opts.ws ?? workspaceId;
    const repo = await newRepo(ws);
    const [pull] = await db()
      .insert(t.pullRequests)
      .values({ workspaceId: ws, repoId: repo.id, number: 1, title: 'Add limiter', author: 'a', branch: 'f', base: 'main', headSha: opts.headSha ?? 'h1', body: 'Adds a limiter.' })
      .returning();
    if (opts.files !== false) {
      await db().insert(t.prFiles).values({ prId: pull!.id, path: 'src/a.ts', additions: 3, deletions: 0, patch: '@@ -1,2 +1,3 @@\n+x\n a\n b' });
    }
    return pull!;
  };

  beforeAll(async () => {
    pg = await startPg();
    await seed(db());
    workspaceId = (await db().select().from(t.workspaces))[0]!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('generate + two reads cost one call, store every field, and a changed head makes the brief stale without a call', async () => {
    const pull = await newPull();
    const url = `/pulls/${pull.id}/brief`;
    const llm = new FakeLlm();
    const app = await appWith(llm);

    expect((await app.inject({ method: 'GET', url })).json()).toEqual({ status: 'none', stale: false, brief: null });

    const res = await app.inject({ method: 'POST', url });
    expect(res.statusCode).toBe(200);
    const posted = PrBriefResponse.parse(res.json());
    expect(posted).toMatchObject({ status: 'ready', stale: false });
    expect(posted.brief).toMatchObject({
      head_sha: 'h1',
      intent: null,
      blast: null,
      history: null,
      usage: { llm_calls: 1, tokens_in: 700, tokens_out: 90, cost_usd: 0.002 },
      dropped_items: 0,
    });
    expect(posted.brief!.inputs!.missing.map((m) => m.input)).toContain('blast');
    expect(llm.calls).toBe(1);

    const started = Date.now();
    const r1 = await app.inject({ method: 'GET', url });
    const r2 = await app.inject({ method: 'GET', url });
    expect(Date.now() - started).toBeLessThan(600); // two reads, each well under the 300 ms budget
    expect(PrBriefResponse.parse(r1.json()).brief).toEqual(posted.brief);
    expect(r2.json().stale).toBe(false);
    expect(llm.calls).toBe(1);

    const [row] = await db().select().from(t.prBrief).where(eq(t.prBrief.prId, pull.id));
    expect((row!.json as { summary: string }).summary).toBe('Adds a rate limiter.');

    await db().update(t.pullRequests).set({ headSha: 'h2' }).where(eq(t.pullRequests.id, pull.id));
    const stale = (await app.inject({ method: 'GET', url })).json();
    expect(stale).toMatchObject({ status: 'ready', stale: true });
    expect(llm.calls).toBe(1);
    await app.close();
  });

  it('a failed generation returns 502 and keeps the stored brief; an empty PR is 409', async () => {
    const pull = await newPull();
    const url = `/pulls/${pull.id}/brief`;
    const good = await appWith(new FakeLlm());
    const first = PrBriefResponse.parse((await good.inject({ method: 'POST', url })).json());
    await good.close();

    const failing = new FakeLlm(new Error('provider exploded'));
    const bad = await appWith(failing);
    const res = await bad.inject({ method: 'POST', url });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('brief_generation_failed');
    expect(failing.calls).toBe(1);
    expect(PrBriefResponse.parse((await bad.inject({ method: 'GET', url })).json()).brief).toEqual(first.brief);

    const empty = await newPull({ files: false });
    const noChanges = await bad.inject({ method: 'POST', url: `/pulls/${empty.id}/brief` });
    expect(noChanges.statusCode).toBe(409);
    expect(noChanges.json().error.code).toBe('no_changes');
    expect(failing.calls).toBe(1);
    await bad.close();
  });

  it('scopes both endpoints to the workspace (404 for a foreign or unknown PR)', async () => {
    const [other] = await db().insert(t.workspaces).values({ name: 'other', slug: `other-${seq++}` } as never).returning();
    const foreign = await newPull({ ws: other!.id });
    const llm = new FakeLlm();
    const app = await appWith(llm);
    for (const id of [foreign.id, '00000000-0000-4000-8000-000000000000']) {
      expect((await app.inject({ method: 'GET', url: `/pulls/${id}/brief` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: `/pulls/${id}/brief` })).statusCode).toBe(404);
    }
    expect(llm.calls).toBe(0);
    await app.close();
  });

  it('the 11th POST within a minute is rate limited (429)', async () => {
    const pull = await newPull();
    const url = `/pulls/${pull.id}/brief`;
    const app = await appWith(new FakeLlm(), 'development');
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) codes.push((await app.inject({ method: 'POST', url })).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
    await app.close();
  });

  it('AC-12 fixture: attachedDocPaths orders agents by created_at, id then enabled skills by link order; disabled ones are absent', async () => {
    const [ws] = await db().insert(t.workspaces).values({ name: 'docs-ws', slug: `docs-ws-${seq++}` } as never).returning();
    const w = ws!.id;
    const at = new Date('2026-01-01T00:00:00Z');
    const mkAgent = async (id: string, paths: string[], enabled = true) =>
      db().insert(t.agents).values({
        id, workspaceId: w, name: `agent-${id}`, provider: 'openrouter', model: 'm', systemPrompt: 'p', contextPaths: paths, enabled, createdAt: at,
      } as never);
    const mkSkill = async (id: string, paths: string[], enabled = true) =>
      db().insert(t.skills).values({
        id, workspaceId: w, name: `skill-${id}`, description: 'd', type: 'custom', source: 'manual', body: 'b', contextPaths: paths, enabled,
      } as never);
    const idA = '00000000-0000-4000-8000-0000000000a1';
    const idB = '00000000-0000-4000-8000-0000000000b2';
    const idC = '00000000-0000-4000-8000-0000000000c3';
    const s1 = '00000000-0000-4000-8000-000000000051';
    const s2 = '00000000-0000-4000-8000-000000000052';
    const s3 = '00000000-0000-4000-8000-000000000053';
    await mkAgent(idB, ['shared.md', 'b.md', 'missing.md']);
    await mkAgent(idA, ['a.md', 'shared.md']);
    await mkAgent(idC, ['c.md'], false);
    await mkSkill(s1, ['s1.md', 'a.md']);
    await mkSkill(s2, ['s2.md']);
    await mkSkill(s3, ['s3.md'], false);
    await db().insert(t.agentSkills).values([
      { agentId: idA, skillId: s1, order: 0, enabled: true },
      { agentId: idA, skillId: s2, order: 1, enabled: false }, // link disabled
      { agentId: idA, skillId: s3, order: 2, enabled: true }, // skill disabled
    ]);

    const repo = new BriefRepository(db());
    expect(await repo.attachedDocPaths(w)).toEqual(['a.md', 'shared.md', 's1.md', 'b.md', 'missing.md']);
    expect(await repo.attachedDocPaths(workspaceId)).not.toContain('a.md');
  });
});
