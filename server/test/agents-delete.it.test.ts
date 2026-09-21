import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/** DELETE /agents/:id really removes the row (and its skill links) from Postgres. */
d('DELETE /agents/:id', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const makeApp = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });

  it('removes the agents row and cascades agent_skills; unknown id is 404', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `del-${Date.now()}`, description: 'd', provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' },
      })
    ).json();
    const [skill] = await pg.handle.db.select().from(t.skills).limit(1);
    await pg.handle.db.insert(t.agentSkills).values({ agentId: created.id, skillId: skill!.id, order: 0 });
    expect(await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, created.id))).toHaveLength(1);

    expect((await app.inject({ method: 'DELETE', url: `/agents/${created.id}` })).statusCode).toBe(200);
    expect(await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, created.id))).toHaveLength(0);
    expect(await pg.handle.db.select().from(t.agentSkills).where(eq(t.agentSkills.agentId, created.id))).toHaveLength(0);
    // the skill itself survives — only the link goes
    expect(await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill!.id))).toHaveLength(1);

    expect((await app.inject({ method: 'DELETE', url: `/agents/${created.id}` })).statusCode).toBe(404);
    await app.close();
  });
});
