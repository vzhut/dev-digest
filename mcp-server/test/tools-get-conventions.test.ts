import { describe, expect, it, vi } from 'vitest';
import { ApiUnreachableError } from '../src/api/errors.js';
import type { ApiClient } from '../src/api/client.js';
import type { ToolContext, ToolDeps } from '../src/deps.js';
import { ToolError } from '../src/format/errors.js';
import { getConventions } from '../src/tools/get-conventions.js';
import { makeCandidate } from './fixtures/reviews.js';

const ctx: ToolContext = { progress: async () => {} };
const base = { repo: 'acme/api', status: 'accepted' as const, limit: 30, response_format: 'concise' as const };

function setup(data: unknown, resolveRepo?: () => Promise<unknown>) {
  const api = { getConventions: vi.fn(async () => data) };
  const deps = {
    api: api as unknown as ApiClient,
    resolvers: { resolveRepo: vi.fn(resolveRepo ?? (async () => ({ id: 'repo-1', full_name: 'acme/api' }))) },
  } as unknown as ToolDeps;
  return { deps, api };
}
const text = (r: { content: { text: string }[] }) => r.content[0]?.text ?? '';

describe('get_conventions', () => {
  it('scan null → not_extracted with an Extract hint (extraction is not triggered)', async () => {
    const { deps, api } = setup({ scan: null, candidates: [] });
    const r = await getConventions(deps, base, ctx);
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(text(r))).toMatchObject({ status: 'not_extracted', repo: 'acme/api', hint: expect.stringContaining('Extract') });
    expect(api.getConventions).toHaveBeenCalledWith('repo-1', {});
  });

  it('3 pending / 0 accepted → none_accepted with pending:3', async () => {
    const cands = [0, 1, 2].map((i) => makeCandidate(i, { status: 'pending' }));
    const r = await getConventions(setup({ scan: { sha: 's1' }, candidates: cands }).deps, base, ctx);
    expect(JSON.parse(text(r))).toMatchObject({ status: 'none_accepted', pending: 3 });
    const pending = await getConventions(setup({ scan: { sha: 's1' }, candidates: cands }).deps, { ...base, status: 'pending' }, ctx);
    expect(JSON.parse(text(pending))).toMatchObject({ status: 'ok', total: 3 });
  });

  it('60 accepted candidates → 30 concise items within 5,000 chars, hint to raise limit, text sanitised', async () => {
    const cands = Array.from({ length: 60 }, (_, i) => makeCandidate(i));
    cands[0] = makeCandidate(0, { rule: 'Use \u001b[31mtabs\u0000 always' });
    const r = await getConventions(setup({ scan: { sha: 's1' }, candidates: cands }).deps, base, ctx);
    const out = text(r);
    expect(out.length).toBeLessThanOrEqual(5_000);
    const body = JSON.parse(out) as { shown: number; total: number; hint: string; conventions: { rule: string; snippet?: string }[] };
    expect(body).toMatchObject({ shown: 30, total: 60 });
    expect(body.hint).toContain('raise limit');
    expect(out).not.toMatch(/\u001b|\\u0000/);
    expect(out).toContain('Use tabs always');
    expect(out).not.toContain('null');
    expect(body.conventions[0]?.snippet).toBeUndefined();
  });

  it('detailed adds snippet and url', async () => {
    const r = await getConventions(setup({ scan: { sha: 's1' }, candidates: [makeCandidate(1)] }).deps, { ...base, response_format: 'detailed' }, ctx);
    expect(JSON.parse(text(r)).conventions[0]).toMatchObject({ snippet: expect.any(String), url: expect.stringContaining('github.com') });
  });

  it('unknown repo (ToolError) and unreachable API (ApiError) → isError with the message', async () => {
    const unknown = await getConventions(setup({}, async () => { throw new ToolError("Repo 'x/y' is not in DevDigest. Known repos: acme/api (add it in the DevDigest UI)."); }).deps, base, ctx);
    expect(unknown).toMatchObject({ isError: true });
    expect(text(unknown)).toContain('Known repos');

    const { deps, api } = setup({});
    api.getConventions.mockRejectedValueOnce(new ApiUnreachableError('http://localhost:3001'));
    const down = await getConventions(deps, base, ctx);
    expect(down.isError).toBe(true);
    expect(text(down)).toContain('./scripts/dev.sh');
  });
});
