import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { FakeIntentLLM, setupPr } from './helpers/intent.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { FsProjectDocs } from '../src/adapters/project-docs/index.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  legacyFlag: true,
   redisUrl: x,`;
const REVIEW: Review = { verdict: 'comment', summary: 'ok', score: 50, findings: [] };

d('project context: listing/run parity and freshness (real FsProjectDocs, tmp clone)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let clone: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
    clone = await mkdtemp(join(tmpdir(), 'ctx-parity-'));
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        // Every reachable provider stubbed: no paid calls.
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW }),
          openrouter: new FakeIntentLLM(undefined, new Error('stub')),
        },
        projectDocs: new FsProjectDocs(),
      },
    });
  });
  afterAll(async () => {
    await pg?.stop();
    await rm(clone, { recursive: true, force: true });
  });

  const write = async (rel: string, content: string) => {
    const full = join(clone, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  };

  async function setup(paths: string[]) {
    const { repo, pr } = await setupPr(pg.handle.db, workspaceId);
    await pg.handle.db.update(t.repos).set({ clonePath: clone }).where(eq(t.repos.id, repo.id));
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `P-${Math.random()}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    await pg.handle.db.update(t.agents).set({ contextPaths: paths }).where(eq(t.agents.id, agent.id));
    return { repo, pr, agent };
  }

  async function review(prId: string, agentId: string) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    // The trace is written just after agent_runs turns terminal; poll for it.
    for (let i = 0; i < 200; i++) {
      const r = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
      if (r.statusCode === 200) return r.json();
      await new Promise((r2) => setTimeout(r2, 50));
    }
    throw new Error('trace never persisted');
  }

  it('listing tokens equal the run trace tokens for the same unchanged doc', async () => {
    await write('specs/parity.md', '# Parity\n\nSame document, same tokenizer — héllo wörld.\n');
    const { repo, pr, agent } = await setup(['specs/parity.md']);

    const listing = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    const listed = listing.files.find((f: { path: string }) => f.path === 'specs/parity.md');
    expect(listed.tokens).toBeGreaterThan(0);

    const trace = await review(pr.id, agent.id);
    const entry = trace.specs_read.find((e: { path: string }) => e.path === 'specs/parity.md');
    expect(entry).toMatchObject({ status: 'included', tokens: listed.tokens });
  });

  it('a doc edited between runs is re-read: the second run carries the new text only', async () => {
    await write('specs/fresh.md', '# Rules\n\nOLD-MARKER: modules may import db.\n');
    const { pr, agent } = await setup(['specs/fresh.md']);

    const first = await review(pr.id, agent.id);
    expect(first.prompt_assembly.specs).toContain('OLD-MARKER');

    await write('specs/fresh.md', '# Rules\n\nNEW-MARKER: modules must not import db.\n');
    const second = await review(pr.id, agent.id);
    expect(second.prompt_assembly.specs).toContain('NEW-MARKER');
    expect(second.prompt_assembly.specs).not.toContain('OLD-MARKER');
  });

  it('AC-35: a doc saved through PUT /repos/:id/context/file is what the next run reads', async () => {
    await write('specs/saved.md', '# Rules\n\nOLD-SAVED: stale rule.\n');
    const { repo, pr, agent } = await setup(['specs/saved.md']);

    const put = await app.inject({
      method: 'PUT',
      url: `/repos/${repo.id}/context/file`,
      payload: { path: 'specs/saved.md', content: '# Rules\n\nNEW-SAVED: fresh rule.\n' },
    });
    expect(put.statusCode).toBe(200);

    const trace = await review(pr.id, agent.id);
    expect(trace.prompt_assembly.specs).toContain('NEW-SAVED');
    expect(trace.prompt_assembly.specs).not.toContain('OLD-SAVED');
  });
});
