import { describe, expect, it, vi } from 'vitest';
import type { ToolContext, ToolDeps } from '../src/deps.js';
import { ToolError } from '../src/format/errors.js';
import { NOT_IMPLEMENTED_MESSAGE, getBlastRadius } from '../src/tools/get-blast-radius.js';

const ctx: ToolContext = { progress: async () => {} };
const args = { repo: 'acme/api', pr: 12, limit: 20 };
const repo = { id: 'r1', full_name: 'acme/api' };

function depsWith(over: { resolveRepo?: () => Promise<unknown>; resolvePr?: () => Promise<unknown> } = {}) {
  const resolvers = {
    resolveRepo: vi.fn(over.resolveRepo ?? (async () => repo)),
    resolvePr: vi.fn(over.resolvePr ?? (async () => ({ id: 'p1', number: 12, title: 't' }))),
  };
  return { deps: { resolvers } as unknown as ToolDeps, resolvers };
}

describe('get_blast_radius (stub)', () => {
  it('valid args → isError, "not implemented", never looks like zero impact, no data fields', async () => {
    const { deps, resolvers } = depsWith();
    const r = await getBlastRadius(deps, args, ctx);
    const out = r.content[0]?.text ?? '';
    expect(r.isError).toBe(true);
    expect(out).toBe(NOT_IMPLEMENTED_MESSAGE);
    expect(out).toContain('not implemented');
    expect(out).toContain('zero impact');
    expect(out).toContain('get_findings');
    expect(JSON.stringify(r)).not.toMatch(/changed_symbols|downstream/);
    expect(resolvers.resolvePr).toHaveBeenCalledWith(repo, 12, undefined);
  });

  it('unknown repo → the standard repo error, PR not looked up', async () => {
    const { deps, resolvers } = depsWith({ resolveRepo: async () => { throw new ToolError("Repo 'x/y' is not in DevDigest. Known repos: acme/api (add it in the DevDigest UI)."); } });
    const r = await getBlastRadius(deps, args, ctx);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('Known repos');
    expect(resolvers.resolvePr).not.toHaveBeenCalled();
  });

  it('unknown PR → the standard PR error', async () => {
    const { deps } = depsWith({ resolvePr: async () => { throw new ToolError('PR #12 not found in acme/api. Open PRs: #3 (import PRs in the DevDigest UI).'); } });
    const r = await getBlastRadius(deps, args, ctx);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('PR #12 not found');
  });
});
