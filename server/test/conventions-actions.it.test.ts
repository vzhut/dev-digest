/**
 * Conventions Extractor — PATCH (accept/reject/edit), skill-draft, and
 * create-skill (§4.1, §9): only accepted rows reach the composed body, the
 * created skill is `source: 'extracted'` with `evidence_files`, it links to
 * the requested agent, and a name clash 409s instead of silently upserting.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const SOURCE_PATH = 'src/a.ts';
const SOURCE_CONTENT = 'await foo()\nawait bar()\n';

const TWO_CANDIDATE_FIXTURE = {
  candidates: [
    {
      category: 'style',
      rule: 'Use async/await, not .then()',
      evidence: { path: SOURCE_PATH, line_start: 1, line_end: 1, quote: 'await foo()', support_pattern: null, violation_pattern: null },
      confidence: 0.9,
    },
    {
      category: 'other',
      rule: 'Call bar after foo',
      evidence: { path: SOURCE_PATH, line_start: 2, line_end: 2, quote: 'await bar()', support_pattern: null, violation_pattern: null },
      confidence: 0.8,
    },
  ],
};

function fakeRepoIntel(samples: string[]): RepoIntel {
  return { getConventionSamples: async () => samples } as unknown as RepoIntel;
}

d('conventions module — patch / skill-draft / skill', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeRepo(): Promise<string> {
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `repo-${Date.now()}-${Math.random()}`,
        fullName: `acme/repo-${Date.now()}-${Math.random()}`,
        clonePath: '/mock/clones/acme/big',
      })
      .returning();
    return r!.id;
  }

  async function makeAgent(): Promise<string> {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: `agent-${Date.now()}-${Math.random()}`, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'Review.' })
      .returning();
    return a!.id;
  }

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ head: 'sha-abc123', files: { [SOURCE_PATH]: SOURCE_CONTENT } }),
        github: new MockGitHubClient(),
        llm: { openrouter: new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: TWO_CANDIDATE_FIXTURE } }) },
        repoIntel: fakeRepoIntel([SOURCE_PATH]),
      },
    });
  }

  async function extractTwo(app: Awaited<ReturnType<typeof makeApp>>, repoId: string) {
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    return res.json().candidates as { id: string; rule: string }[];
  }

  it('PATCH accepts, rejects, and edits — edit sets the `edited` chip, empty rule 422s', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    const [a, b] = await extractTwo(app, repoId);

    const accept = await app.inject({ method: 'PATCH', url: `/repos/${repoId}/conventions/${a!.id}`, payload: { status: 'accepted' } });
    expect(accept.statusCode).toBe(200);
    expect(accept.json()).toMatchObject({ status: 'accepted', edited: false });

    const reject = await app.inject({ method: 'PATCH', url: `/repos/${repoId}/conventions/${b!.id}`, payload: { status: 'rejected' } });
    expect(reject.json()).toMatchObject({ status: 'rejected' });

    const edited = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/${a!.id}`,
      payload: { rule: 'Always use async/await' },
    });
    expect(edited.json()).toMatchObject({ rule: 'Always use async/await', edited: true, status: 'accepted' });

    const emptyRule = await app.inject({ method: 'PATCH', url: `/repos/${repoId}/conventions/${a!.id}`, payload: { rule: '   ' } });
    expect(emptyRule.statusCode).toBe(422);

    const missing = await app.inject({
      method: 'PATCH',
      url: `/repos/${repoId}/conventions/00000000-0000-0000-0000-000000000000`,
      payload: { status: 'accepted' },
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('skill-draft reads the CURRENT accepted set and persists nothing', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    const [a] = await extractTwo(app, repoId);

    const empty = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill-draft` })).json();
    expect(empty).toMatchObject({ name: 'repo-conventions', count: 0 });
    expect(empty.body).not.toContain('##');

    await app.inject({ method: 'PATCH', url: `/repos/${repoId}/conventions/${a!.id}`, payload: { status: 'accepted' } });
    const draft = (await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill-draft` })).json();
    expect(draft).toMatchObject({ name: 'repo-conventions', type: 'convention', count: 1 });
    expect(draft.body).toContain('Use async/await, not .then()');
    expect(draft.evidence_files).toEqual([SOURCE_PATH]);

    const scansBefore = await pg.handle.db.select().from(t.skills);
    expect(scansBefore.some((s) => s.name === 'repo-conventions')).toBe(false); // nothing saved
    await app.close();
  });

  it('creates an extracted skill with only the accepted rule, links the agent, and 409s on a name clash', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    const agentId = await makeAgent();
    const [a, b] = await extractTwo(app, repoId);

    await app.inject({ method: 'PATCH', url: `/repos/${repoId}/conventions/${a!.id}`, payload: { status: 'accepted' } });
    await app.inject({ method: 'PATCH', url: `/repos/${repoId}/conventions/${b!.id}`, payload: { status: 'rejected' } });

    const created = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { agent_ids: [agentId] },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json();
    expect(body.skill).toMatchObject({ name: 'repo-conventions', source: 'extracted', type: 'convention', version: 1, enabled: true });
    expect(body.skill.body).toContain('Use async/await, not .then()');
    expect(body.skill.body).not.toContain('Call bar after foo'); // rejected — absent
    expect(body.skill.evidence_files).toEqual([SOURCE_PATH]);
    expect(body.agent_ids_linked).toEqual([agentId]);

    const link = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, body.skill.id)));
    expect(link).toHaveLength(1);
    expect(link[0]).toMatchObject({ enabled: true });

    const clash = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: {} });
    expect(clash.statusCode).toBe(409);
    expect(clash.json().error.details).toMatchObject({ existing_skill_id: body.skill.id });
    await app.close();
  });
});
