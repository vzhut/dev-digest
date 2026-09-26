import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api/client.js';
import type { Agent, PrMeta, Repo } from '../src/api/schemas.js';
import { ToolError } from '../src/format/errors.js';
import { CACHE_TTL_MS, createResolvers } from '../src/resolve.js';

const REPO_ID = '11111111-1111-4111-8111-111111111111';
const repos: Repo[] = [{ id: REPO_ID, full_name: 'Acme/API' }];
const pulls: PrMeta[] = [
  { id: 'pr-uuid-12', number: 12, title: 'Fix', status: 'needs_review' },
  { id: 'pr-uuid-9', number: 9, title: 'Old', status: 'merged' },
  { id: null, number: 15, title: 'No id', status: 'open' },
];
const agent = (id: string, name: string, enabled = true): Agent => ({ id, name, provider: 'openrouter', model: 'm', enabled, description: '' });

function setup(over: { repos?: Repo[]; pulls?: PrMeta[]; agents?: Agent[] } = {}) {
  let t = 1_000;
  const api = {
    listRepos: vi.fn(async () => over.repos ?? repos),
    listPulls: vi.fn(async () => over.pulls ?? pulls),
    listAgents: vi.fn(async () => over.agents ?? [agent('a1', 'General reviewer'), agent('a2', 'Security', false)]),
  } as unknown as ApiClient & { listRepos: ReturnType<typeof vi.fn>; listPulls: ReturnType<typeof vi.fn>; listAgents: ReturnType<typeof vi.fn> };
  const r = createResolvers({ api, now: () => t });
  return { r, api, advance: (ms: number) => (t += ms) };
}

async function message(p: Promise<unknown>): Promise<string> {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ToolError);
  return (err as Error).message;
}

describe('resolveRepo', () => {
  it('matches owner/name case-insensitively, or by uuid', async () => {
    const { r } = setup();
    expect((await r.resolveRepo('acme/api')).id).toBe(REPO_ID);
    expect((await r.resolveRepo(REPO_ID)).full_name).toBe('Acme/API');
  });

  it('unknown repo lists at most 10 known names', async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id: `id-${i}`, full_name: `org/repo-${i}` }));
    const { r } = setup({ repos: many });
    const msg = await message(r.resolveRepo('nope/none'));
    expect(msg).toContain("Repo 'nope/none' is not in DevDigest");
    expect(msg).toContain('org/repo-0');
    expect(msg).toContain('org/repo-9');
    expect(msg).not.toContain('org/repo-10');
    expect(msg).toContain('4 more');
    expect(msg).toContain('DevDigest UI');
  });

  it('caches for 60 s (no second fetch), refetches after the TTL', async () => {
    const { r, api, advance } = setup();
    await r.resolveRepo('acme/api');
    await r.resolveRepo('acme/api');
    expect(api.listRepos).toHaveBeenCalledTimes(1);
    advance(CACHE_TTL_MS + 1);
    await r.resolveRepo('acme/api');
    expect(api.listRepos).toHaveBeenCalledTimes(2);
  });

  it('a miss on a cached list refetches once (repo added meanwhile) and a failed load is not cached', async () => {
    const { r, api } = setup();
    await r.resolveRepo('acme/api');
    api.listRepos.mockResolvedValueOnce([...repos, { id: 'n', full_name: 'acme/new' }]);
    expect((await r.resolveRepo('acme/new')).id).toBe('n');
    expect(api.listRepos).toHaveBeenCalledTimes(2);

    const failing = setup();
    failing.api.listRepos.mockRejectedValueOnce(new Error('down'));
    await expect(failing.r.resolveRepo('acme/api')).rejects.toThrow('down');
    await expect(failing.r.resolveRepo('acme/api')).resolves.toBeTruthy();
  });
});

describe('resolvePr', () => {
  const repo: Repo = { id: REPO_ID, full_name: 'Acme/API' };

  it('maps a PR number to its uuid; caches per repo', async () => {
    const { r, api } = setup();
    expect(await r.resolvePr(repo, 12)).toEqual({ id: 'pr-uuid-12', number: 12, title: 'Fix' });
    await r.resolvePr(repo, 9);
    expect(api.listPulls).toHaveBeenCalledTimes(1);
  });

  it('unknown PR lists open PRs, newest first', async () => {
    const { r } = setup();
    const msg = await message(r.resolvePr(repo, 99));
    expect(msg).toContain('PR #99 not found in Acme/API');
    expect(msg).toContain('Open PRs: #15, #12');
    expect(msg).not.toContain('#9,');
    expect(msg).not.toContain('#9 ');
    expect(msg).toContain('DevDigest UI');
  });

  it('PR without a DevDigest id and repos without PRs give next steps', async () => {
    const { r } = setup();
    expect(await message(r.resolvePr(repo, 15))).toContain('open it once in the DevDigest UI');
    const empty = setup({ pulls: [] });
    expect(await message(empty.r.resolvePr(repo, 1))).toContain('import PRs');
  });
});

describe('resolveAgent', () => {
  it('matches by id or case-insensitive exact name', async () => {
    const { r } = setup();
    expect((await r.resolveAgent('a1')).name).toBe('General reviewer');
    expect((await r.resolveAgent('GENERAL REVIEWER')).id).toBe('a1');
  });

  it('unknown agent points to list_agents', async () => {
    const { r } = setup();
    expect(await message(r.resolveAgent('foo'))).toBe("Agent 'foo' not found — call list_agents for valid names.");
  });

  it('two alike names → "pass the id" with the ids listed', async () => {
    const { r } = setup({ agents: [agent('id-1', 'Reviewer'), agent('id-2', 'reviewer')] });
    const msg = await message(r.resolveAgent('reviewer'));
    expect(msg).toContain('matches 2 agents');
    expect(msg).toContain('pass the id');
    expect(msg).toContain('[id-1]');
  });

  it('requireEnabled: refuses a disabled agent but prefers an enabled namesake', async () => {
    const { r } = setup();
    expect(await message(r.resolveAgent('security', { requireEnabled: true }))).toContain('is disabled');
    expect((await r.resolveAgent('security')).enabled).toBe(false);

    const twins = setup({ agents: [agent('x1', 'Twin', false), agent('x2', 'Twin', true)] });
    expect((await twins.r.resolveAgent('twin', { requireEnabled: true })).id).toBe('x2');
  });
});
