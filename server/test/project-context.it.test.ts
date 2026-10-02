import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import { ContextListing } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('project-context module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let clone: string;
  let outside: string;
  let seq = 0;

  const db = () => pg.handle.db;
  const put = async (rel: string, content = '# doc') => {
    const full = join(clone, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  };
  const newRepo = async (clonePath: string | null) => {
    const name = `ctx-${seq++}`;
    const [r] = await db()
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return r!;
  };
  const newAgent = async (contextPaths: string[] = [], enabled = true) => {
    const [a] = await db()
      .insert(t.agents)
      .values({
        workspaceId,
        name: `ctx-agent-${seq++}`,
        provider: 'openai',
        model: 'm',
        systemPrompt: 'p',
        contextPaths,
        enabled,
      })
      .returning();
    return a!;
  };
  const newSkill = async (contextPaths: string[] = [], enabled = true) => {
    const [s] = await db()
      .insert(t.skills)
      .values({
        workspaceId,
        name: `ctx-skill-${seq++}`,
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: 'b',
        contextPaths,
        enabled,
      })
      .returning();
    return s!;
  };
  const link = (agentId: string, skillId: string, enabled = true, order = 0) =>
    db().insert(t.agentSkills).values({ agentId, skillId, enabled, order });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    clone = await mkdtemp(join(tmpdir(), 'pc-clone-'));
    outside = await mkdtemp(join(tmpdir(), 'pc-out-'));
  });
  afterAll(async () => {
    await pg?.stop();
    await rm(clone, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('lists docs fresh on every request, with default and custom roots, and reports not_cloned', async () => {
    const repo = await newRepo(clone);
    await put('specs/a.md', '# A spec');
    await put('docs/b.md', '# B doc');
    await put('adr/c.md', '# adr');

    const first = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(first.statusCode).toBe(200);
    const listing = ContextListing.parse(first.json());
    expect(listing.status).toBe('ok');
    expect(listing.files.map((f) => f.path)).toEqual(['docs/b.md', 'specs/a.md']);
    expect(listing.files.map((f) => f.type)).toEqual(['docs', 'specs']);
    expect(listing.total_tokens).toBe(listing.files.reduce((s, f) => s + f.tokens, 0));

    // AC-7: a new file shows up on the next GET.
    await put('insights/new.md');
    const second = ContextListing.parse((await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json());
    expect(second.files.map((f) => f.path)).toContain('insights/new.md');

    // AC-3: custom roots; 21 globs → 422 and roots unchanged; [] → default again.
    const put1 = await app.inject({
      method: 'PUT',
      url: `/repos/${repo.id}/context/roots`,
      payload: { roots: ['adr/**/*.md'] },
    });
    expect(put1.statusCode).toBe(200);
    const custom = ContextListing.parse((await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json());
    expect(custom.files.map((f) => f.path)).toEqual(['adr/c.md']);

    const tooMany = await app.inject({
      method: 'PUT',
      url: `/repos/${repo.id}/context/roots`,
      payload: { roots: Array.from({ length: 21 }, (_, i) => `g${i}/**/*.md`) },
    });
    expect(tooMany.statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: `/repos/${repo.id}/context/roots` })).json()).toEqual({
      roots: ['adr/**/*.md'],
    });

    const reset = await app.inject({ method: 'PUT', url: `/repos/${repo.id}/context/roots`, payload: { roots: [] } });
    expect(reset.json()).toEqual({ roots: ['**/{specs,docs,insights}/**/*.md'] });
    expect((await db().select().from(t.repos).where(eq(t.repos.id, repo.id)))[0]!.contextRoots).toBeNull();

    // AC-6: not cloned (null path, missing dir) and empty clone.
    for (const p of [null, join(tmpdir(), 'pc-does-not-exist-xyz')]) {
      const r = await newRepo(p);
      const body = ContextListing.parse((await app.inject({ method: 'GET', url: `/repos/${r.id}/context` })).json());
      expect(body).toMatchObject({ status: 'not_cloned', files: [], total_tokens: 0 });
    }
    const emptyDir = await mkdtemp(join(tmpdir(), 'pc-empty-'));
    const emptyRepo = await newRepo(emptyDir);
    const empty = ContextListing.parse((await app.inject({ method: 'GET', url: `/repos/${emptyRepo.id}/context` })).json());
    expect(empty).toMatchObject({ status: 'ok', files: [] });
    await rm(emptyDir, { recursive: true, force: true });
  });

  it('serves a file preview and rejects traversal, absolute, symlink, absent and foreign ids', async () => {
    const repo = await newRepo(clone);
    await put('docs/preview.md', '# Hello');
    await writeFile(join(outside, 'secret.md'), 'secret');
    await mkdir(join(clone, 'docs'), { recursive: true });
    await symlink(join(outside, 'secret.md'), join(clone, 'docs/link.md')).catch(() => undefined);
    const get = (path: string) =>
      app.inject({ method: 'GET', url: `/repos/${repo.id}/context/file?path=${encodeURIComponent(path)}` });

    const ok = await get('docs/preview.md');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ path: 'docs/preview.md', content: '# Hello' });

    expect((await get('../../etc/passwd.md')).statusCode).toBe(422);
    expect((await get('/abs/docs/x.md')).statusCode).toBe(422);
    expect((await get('docs/link.md')).statusCode).toBe(404);
    expect((await get('docs/absent.md')).statusCode).toBe(404);
    expect((await get('src/outside-roots.md')).statusCode).toBe(404);

    const foreign = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/repos/${foreign}/context` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/agents/${foreign}/context` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/skills/${foreign}/context` })).statusCode).toBe(404);
  });

  it('saves agent/skill context in order, validates paths, creates no versions, and exposes inherited docs', async () => {
    const agent = await newAgent();
    const skill = await newSkill(['docs/from-skill.md']);
    const off = await newSkill(['docs/off.md'], false);
    await link(agent.id, skill.id, true, 0);
    await link(agent.id, off.id, true, 1);

    const saved = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['specs/b.md', 'docs/a.md'] },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({
      paths: ['specs/b.md', 'docs/a.md'],
      inherited: [{ skill_id: skill.id, skill_name: skill.name, paths: ['docs/from-skill.md'] }],
    });

    // AC-10: bad paths → 422, previous selection intact.
    for (const bad of ['../../etc/passwd.md', 'docs/a".md', 'docs\\a.md', 'a.txt']) {
      const r = await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context`, payload: { paths: [bad] } });
      expect(r.statusCode).toBe(422);
    }
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/context` })).json().paths).toEqual([
      'specs/b.md',
      'docs/a.md',
    ]);

    // AC-8/AC-9: only the column changes; no version bump or snapshot.
    const [row] = await db().select().from(t.agents).where(eq(t.agents.id, agent.id));
    expect(row!.version).toBe(1);
    expect(await db().select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agent.id))).toHaveLength(0);

    const sk = await app.inject({ method: 'PUT', url: `/skills/${skill.id}/context`, payload: { paths: ['docs/x.md'] } });
    expect(sk.json()).toEqual({ paths: ['docs/x.md'] });
    expect((await db().select().from(t.skills).where(eq(t.skills.id, skill.id)))[0]!.version).toBe(1);
    expect(await db().select().from(t.skillVersions).where(eq(t.skillVersions.skillId, skill.id))).toHaveLength(0);
  });

  it('counts used_by_agents: direct + via enabled skill link, not via disabled link/skill, disabled agents count', async () => {
    const repo = await newRepo(clone);
    await put('docs/shared-used.md');
    const p = 'docs/shared-used.md';
    await newAgent([p]);
    await newAgent([p], false); // disabled agent attaching directly still counts
    const viaSkillAgent = await newAgent();
    const skill = await newSkill([p]);
    await link(viaSkillAgent.id, skill.id);
    const disabledLinkAgent = await newAgent();
    await link(disabledLinkAgent.id, skill.id, false);
    const disabledSkill = await newSkill([p], false);
    await link(disabledLinkAgent.id, disabledSkill.id);

    const listing = ContextListing.parse((await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json());
    expect(listing.files.find((f) => f.path === p)!.used_by_agents).toBe(3);
  });

  it('PUT /repos/:id/context/file replaces one doc in the local clone and rejects everything else', async () => {
    const wclone = await mkdtemp(join(tmpdir(), 'pc-write-'));
    const woutside = await mkdtemp(join(tmpdir(), 'pc-wout-'));
    try {
      const wput = async (rel: string, c = '# old') => {
        const full = join(wclone, rel);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, c);
      };
      await wput('docs/a.md');
      await wput('docs/other.md', 'untouched');
      await wput('src/a.md');
      await wput('node_modules/x/docs/y.md');
      await wput('.GIT/keep.md', 'git-original');
      await wput('a/.Git/b.md', 'git-original');
      await wput('Node_Modules/z.md', 'nm-original');
      await writeFile(join(woutside, 'sentinel.md'), 'sentinel');
      await symlink(join(woutside, 'sentinel.md'), join(wclone, 'docs/link.md'));
      await symlink(woutside, join(wclone, 'specs'));
      const repo = await newRepo(wclone);
      await db().update(t.repos).set({ contextRoots: ['**/*.md'] }).where(eq(t.repos.id, repo.id));
      const put = (path: string, content: string, id = repo.id) =>
        app.inject({ method: 'PUT', url: `/repos/${id}/context/file`, payload: { path, content } });
      const snapshot = async () => ({
        docs: (await readdir(join(wclone, 'docs'))).sort(),
        a: await readFile(join(wclone, 'docs/a.md'), 'utf8'),
        other: await readFile(join(wclone, 'docs/other.md'), 'utf8'),
        src: await readFile(join(wclone, 'src/a.md'), 'utf8'),
        sentinel: await readFile(join(woutside, 'sentinel.md'), 'utf8'),
      });

      const info = vi.spyOn(app.log, 'info');
      const text = 'new héllo SECRET-TEXT';
      const ok = await put('docs/a.md', text);
      expect(ok.statusCode).toBe(200);
      const listed = ContextListing.parse(
        (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json(),
      );
      expect(ok.json()).toEqual({
        path: 'docs/a.md',
        content: text,
        size_bytes: Buffer.byteLength(text),
        tokens: listed.files.find((f) => f.path === 'docs/a.md')!.tokens,
      });
      const after = await snapshot();
      expect(after).toMatchObject({ a: text, other: 'untouched', src: '# old', sentinel: 'sentinel' });
      expect(after.docs).toEqual(['a.md', 'link.md', 'other.md']);
      const wrote = info.mock.calls.map((c) => c.map(String).join(' ')).filter((m) => m.includes('project context: wrote'));
      expect(wrote).toEqual([`project context: wrote docs/a.md (${Buffer.byteLength(text)} bytes)`]);
      expect(wrote.join()).not.toContain('SECRET-TEXT');
      info.mockClear();

      const before = await snapshot();
      // 422: invalid paths and oversize content.
      for (const bad of ['../../etc/passwd.md', 'docs\\a.md', 'docs/a\n.md', '/abs.md', 'docs/a.txt']) {
        expect((await put(bad, 'x')).statusCode).toBe(422);
      }
      expect((await put('docs/a.md', 'ab '.repeat(349_526).slice(0, 1_048_577))).statusCode).toBe(422);
      expect((await put('docs/a.md', 'ab '.repeat(349_526).slice(0, 1_048_576))).statusCode).toBe(200);
      await put('docs/a.md', text);
      info.mockClear();

      // 404: absent, outside roots, symlink, symlinked parent, node_modules, other workspace.
      for (const missing of [
        'docs/new.md',
        'docs/link.md',
        'specs/sentinel.md',
        'node_modules/x/docs/y.md',
        '.GIT/keep.md',
        'a/.Git/b.md',
        'Node_Modules/z.md',
      ]) {
        expect((await put(missing, 'x')).statusCode).toBe(404);
      }
      expect((await put('docs/a.md', 'x', '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
      expect(await snapshot()).toEqual(before);
      for (const [rel, orig] of [['.GIT/keep.md', 'git-original'], ['a/.Git/b.md', 'git-original'], ['Node_Modules/z.md', 'nm-original']] as const) {
        expect(await readFile(join(wclone, rel), 'utf8')).toBe(orig);
      }
      expect(await readdir(join(wclone, 'docs/..', 'node_modules/x/docs'))).toEqual(['y.md']);
      expect(info.mock.calls.map((c) => c.map(String).join(' ')).filter((m) => m.includes('project context: wrote'))).toEqual([]);

      // 404 not cloned.
      const noClone = await newRepo(null);
      const nc = await put('docs/a.md', 'x', noClone.id);
      expect(nc.statusCode).toBe(404);
      expect(nc.json().error.message).toMatch(/not cloned/i);
      info.mockRestore();
    } finally {
      await rm(wclone, { recursive: true, force: true });
      await rm(woutside, { recursive: true, force: true });
    }
  });
});
