import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsService } from '../src/modules/skills/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Skills module (spec §5.1, §12): CRUD round-trip, versioning, restore, cascade,
 * workspace isolation, stats (null accept_rate, 30d boundary, survives unlink).
 */
d('skills module', () => {
  let pg: PgFixture;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const payload = (over: Record<string, unknown> = {}) => ({
    name: `skill-${seq++}-${Date.now()}`,
    description: 'Apply when reviewing X',
    type: 'rubric',
    body: 'v1 body',
    ...over,
  });

  async function defaultWorkspaceId(): Promise<string> {
    const app = await makeApp();
    const skill = (await app.inject({ method: 'POST', url: '/skills', payload: payload() })).json();
    const [row] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));
    await app.close();
    return row!.workspaceId;
  }

  it('CRUD round-trip: create is manual v1, get/list/update/delete', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: payload({ name: 'crud-1' }) });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ name: 'crud-1', source: 'manual', version: 1, enabled: true });

    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json().id).toBe(skill.id);
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((s: { id: string }) => s.id === skill.id)).toBe(true);

    const put = await app.inject({
      method: 'PUT', url: `/skills/${skill.id}`, payload: { description: 'new desc', enabled: false },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ description: 'new desc', enabled: false, version: 1 });

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('duplicate name → 409 on POST and PUT', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: '/skills', payload: payload({ name: 'dup-a' }) });
    const b = (await app.inject({ method: 'POST', url: '/skills', payload: payload({ name: 'dup-b' }) })).json();
    expect((await app.inject({ method: 'POST', url: '/skills', payload: payload({ name: 'dup-a' }) })).statusCode).toBe(409);
    expect((await app.inject({ method: 'PUT', url: `/skills/${b.id}`, payload: { name: 'dup-a' } })).statusCode).toBe(409);
    // renaming to its own name is fine
    expect((await app.inject({ method: 'PUT', url: `/skills/${b.id}`, payload: { name: 'dup-b' } })).statusCode).toBe(200);
    await app.close();
  });

  it('body change snapshots the previous body + bumps version; metadata change does not', async () => {
    const app = await makeApp();
    const s = (await app.inject({ method: 'POST', url: '/skills', payload: payload({ body: 'one' }) })).json();

    await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { description: 'meta only' } });
    expect((await app.inject({ method: 'GET', url: `/skills/${s.id}/versions` })).json()).toHaveLength(0);

    const put = await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'two' } });
    expect(put.json()).toMatchObject({ body: 'two', version: 2 });
    // same body again → no new version
    await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'two' } });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${s.id}/versions` })).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ skill_id: s.id, version: 1, body: 'one' });
    await app.close();
  });

  it('restore appends a new version with the old body', async () => {
    const app = await makeApp();
    const s = (await app.inject({ method: 'POST', url: '/skills', payload: payload({ body: 'one' }) })).json();
    await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'two' } });

    const restored = await app.inject({ method: 'POST', url: `/skills/${s.id}/versions/1/restore` });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ body: 'one', version: 3 });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${s.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].body).toBe('two');
    expect((await app.inject({ method: 'POST', url: `/skills/${s.id}/versions/99/restore` })).statusCode).toBe(404);
    await app.close();
  });

  it('delete cascades agent_skills, skill_versions and run_skills', async () => {
    const app = await makeApp();
    const s = (await app.inject({ method: 'POST', url: '/skills', payload: payload() })).json();
    await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'changed' } });
    const workspaceId = await defaultWorkspaceId();
    const [agent] = await pg.handle.db.select().from(t.agents).limit(1);
    await pg.handle.db.insert(t.agentSkills).values({ agentId: agent!.id, skillId: s.id, order: 0 });
    const [run] = await pg.handle.db.insert(t.agentRuns).values({ workspaceId, status: 'done' }).returning();
    await pg.handle.db.insert(t.runSkills).values({ runId: run!.id, skillId: s.id });

    await app.inject({ method: 'DELETE', url: `/skills/${s.id}` });
    expect(await pg.handle.db.select().from(t.agentSkills).where(eq(t.agentSkills.skillId, s.id))).toHaveLength(0);
    expect(await pg.handle.db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, s.id))).toHaveLength(0);
    expect(await pg.handle.db.select().from(t.runSkills).where(eq(t.runSkills.skillId, s.id))).toHaveLength(0);
    await app.close();
  });

  it('workspace isolation: another workspace cannot see, edit, or collide with a skill', async () => {
    const app = await makeApp();
    const s = (await app.inject({ method: 'POST', url: '/skills', payload: payload({ name: 'iso-1' }) })).json();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();

    const container = app.container;
    const svc = new SkillsService(container);
    expect(await svc.get(other!.id, s.id)).toBeUndefined();
    expect(await svc.update(other!.id, s.id, { description: 'hax' })).toBeUndefined();
    expect(await svc.delete(other!.id, s.id)).toBe(false);
    expect(await svc.listVersions(other!.id, s.id)).toBeUndefined();
    expect(await svc.stats(other!.id, s.id)).toBeUndefined();
    expect(await svc.list(other!.id)).toHaveLength(0);
    expect(await svc.findByName(other!.id, 'iso-1')).toBeUndefined();
    // same name is allowed in the other workspace
    const created = await svc.create(other!.id, { name: 'iso-1', description: 'd', type: 'custom', body: 'b' });
    expect(created.id).not.toBe(s.id);
    await app.close();
  });

  it('createImported / updateFromImport / findByName', async () => {
    const app = await makeApp();
    const workspaceId = await defaultWorkspaceId();
    const svc = new SkillsService(app.container);
    const name = `imp-${Date.now()}`;
    const imp = await svc.createImported(workspaceId, { name, description: 'd', type: 'convention', body: 'b1' });
    expect(imp).toMatchObject({ source: 'imported_url', enabled: false, version: 1 });
    expect((await svc.findByName(workspaceId, name))?.id).toBe(imp.id);

    await svc.update(workspaceId, imp.id, { enabled: true });
    const same = await svc.updateFromImport(workspaceId, imp.id, { description: 'd2', type: 'convention', body: 'b1' });
    expect(same).toMatchObject({ version: 1, enabled: true, description: 'd2' });
    const bumped = await svc.updateFromImport(workspaceId, imp.id, { description: 'd2', type: 'security', body: 'b2' });
    expect(bumped).toMatchObject({ version: 2, enabled: true, type: 'security', body: 'b2' });
    await app.close();
  });

  describe('GET /skills/:id/stats', () => {
    async function scenario() {
      const app = await makeApp();
      const workspaceId = await defaultWorkspaceId();
      const s = (await app.inject({ method: 'POST', url: '/skills', payload: payload() })).json();
      return { app, workspaceId, skill: s as { id: string } };
    }

    async function addRun(
      workspaceId: string,
      skillId: string,
      ranAt: Date,
      findings: { category: string; accepted?: boolean; dismissed?: boolean }[] = [],
    ) {
      const db = pg.handle.db;
      const [run] = await db.insert(t.agentRuns).values({ workspaceId, status: 'done', ranAt }).returning();
      await db.insert(t.runSkills).values({ runId: run!.id, skillId });
      if (findings.length === 0) return run!;
      const [repo] = await db.insert(t.repos).values({
        workspaceId, owner: 'acme', name: `r-${seq++}`, fullName: `acme/r-${seq}-${Date.now()}`,
      }).returning();
      const [pr] = await db.insert(t.pullRequests).values({
        workspaceId, repoId: repo!.id, number: 1, title: 't', author: 'a', branch: 'b', base: 'main',
        headSha: 'sha', additions: 0, deletions: 0, filesCount: 0, status: 'needs_review', body: '',
      }).returning();
      const [review] = await db.insert(t.reviews).values({
        workspaceId, prId: pr!.id, runId: run!.id, kind: 'review',
      }).returning();
      await db.insert(t.findings).values(findings.map((f) => ({
        reviewId: review!.id, file: 'a.ts', startLine: 1, endLine: 1, severity: 'warning',
        category: f.category, title: 't', rationale: 'r', confidence: 0.9,
        acceptedAt: f.accepted ? new Date() : null, dismissedAt: f.dismissed ? new Date() : null,
      })));
      return run!;
    }

    it('empty: zero runs, null accept_rate', async () => {
      const { app, skill } = await scenario();
      const stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
      expect(stats).toEqual({
        used_by: 0, agents: [], runs_30d: 0, findings_30d: 0, accept_rate: null, findings_by_category: [],
      });
      await app.close();
    });

    it('accept_rate is null with findings but no verdicts; computed once verdicts exist', async () => {
      const { app, workspaceId, skill } = await scenario();
      await addRun(workspaceId, skill.id, new Date(), [{ category: 'bug' }, { category: 'bug' }]);
      let stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
      expect(stats).toMatchObject({ runs_30d: 1, findings_30d: 2, accept_rate: null });
      expect(stats.findings_by_category).toEqual([{ category: 'bug', count: 2 }]);

      await addRun(workspaceId, skill.id, new Date(), [
        { category: 'style', accepted: true }, { category: 'style', accepted: true }, { category: 'bug', dismissed: true },
      ]);
      stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
      expect(stats).toMatchObject({ runs_30d: 2, findings_30d: 5 });
      expect(stats.accept_rate).toBeCloseTo(2 / 3, 6);
      expect(stats.findings_by_category[0]).toEqual({ category: 'bug', count: 3 });
      await app.close();
    });

    it('30-day window: 29d old counted, 31d old excluded', async () => {
      const { app, workspaceId, skill } = await scenario();
      const day = 24 * 60 * 60 * 1000;
      await addRun(workspaceId, skill.id, new Date(Date.now() - 29 * day));
      await addRun(workspaceId, skill.id, new Date(Date.now() - 31 * day), [{ category: 'bug' }]);
      const stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
      expect(stats.runs_30d).toBe(1);
      expect(stats.findings_30d).toBe(0);
      await app.close();
    });

    it('used_by/agents come from agent_skills; run counts survive unlinking', async () => {
      const { app, workspaceId, skill } = await scenario();
      const [agent] = await pg.handle.db.select().from(t.agents).limit(1);
      await pg.handle.db.insert(t.agentSkills).values({ agentId: agent!.id, skillId: skill.id, order: 0, enabled: false });
      await addRun(workspaceId, skill.id, new Date());

      let stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
      expect(stats.used_by).toBe(1);
      expect(stats.agents).toEqual([{ id: agent!.id, name: agent!.name, enabled: false }]);

      await pg.handle.db.delete(t.agentSkills).where(eq(t.agentSkills.skillId, skill.id));
      stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
      expect(stats.used_by).toBe(0);
      expect(stats.runs_30d).toBe(1);
      await app.close();
    });

    it('404 for an unknown skill', async () => {
      const app = await makeApp();
      const res = await app.inject({ method: 'GET', url: '/skills/00000000-0000-4000-8000-000000000000/stats' });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});
