import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api/client.js';
import type { ToolContext, ToolDeps } from '../src/deps.js';
import { ToolError } from '../src/format/errors.js';
import { getBlastRadius } from '../src/tools/get-blast-radius.js';

const ctx: ToolContext = { progress: async () => {} };
const args = { repo: 'acme/api', pr: 12, limit: 20 };
const repo = { id: 'r1', full_name: 'acme/api' };
const pr = { id: 'p1', number: 12, title: 't' };

const okBlast = {
  changed_symbols: [{ name: 'runReview', file: 'server/src/modules/reviews/service.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'runReview',
      file: 'server/src/modules/reviews/service.ts',
      callers: [{ name: 'handler', file: 'server/src/modules/pulls/routes.ts', line: 42 }],
      callers_total: 3,
      endpoints_affected: ['POST /pulls/:id/review'],
      crons_affected: [],
    },
  ],
  summary: '1 of 1 changed symbol has callers: 3 callers, 1 endpoint, 0 crons.',
  degraded: false,
  reason: null,
  index_status: 'full',
};

const degradedBlast = {
  changed_symbols: [],
  downstream: [],
  summary: 'No indexed symbols in the changed files. Index incomplete (index_partial).',
  degraded: true,
  reason: 'index_partial',
  index_status: 'partial',
};

function depsWith(over: {
  resolveRepo?: () => Promise<unknown>;
  resolvePr?: () => Promise<unknown>;
  getPull?: () => Promise<void>;
  getBlast?: () => Promise<unknown>;
} = {}) {
  const resolvers = {
    resolveRepo: vi.fn(over.resolveRepo ?? (async () => repo)),
    resolvePr: vi.fn(over.resolvePr ?? (async () => pr)),
  };
  const api = {
    getPull: vi.fn(over.getPull ?? (async () => {})),
    getBlast: vi.fn(over.getBlast ?? (async () => okBlast)),
  };
  const deps = { resolvers, api } as unknown as ToolDeps;
  return { deps, resolvers, api };
}

const text = (r: { content: { text: string }[] }) => r.content[0]?.text ?? '';

describe('get_blast_radius', () => {
  it('ok map → status:"ok", callers as file:line, callers_total ≥ shown callers; getPull called before getBlast', async () => {
    const { deps, api } = depsWith();
    const r = await getBlastRadius(deps, args, ctx);
    expect(r.isError).toBeUndefined();
    const body = JSON.parse(text(r));
    expect(body.status).toBe('ok');
    expect(body.downstream[0].callers[0].where).toBe('server/src/modules/pulls/routes.ts:42');
    expect(body.downstream[0].callers_total).toBeGreaterThanOrEqual(body.downstream[0].callers.length);
    const getPullOrder = api.getPull.mock.invocationCallOrder[0];
    const getBlastOrder = api.getBlast.mock.invocationCallOrder[0];
    expect(getPullOrder).toBeLessThan(getBlastOrder as number);
  });

  it('degraded fixture → status:"incomplete", reason, a hint containing "resync", isError:false', async () => {
    const { deps } = depsWith({ getBlast: async () => degradedBlast });
    const r = await getBlastRadius(deps, args, ctx);
    expect(r.isError).toBeFalsy(); // never true for a degraded (but valid) map
    const body = JSON.parse(text(r));
    expect(body.status).toBe('incomplete');
    expect(body.reason).toBe('index_partial');
    expect(body.hint).toContain('resync');
    expect(JSON.stringify(body)).not.toBe('{"status":"incomplete"}'); // never a bare empty map
  });

  it('unknown repo → the standard repo error, PR not looked up, no API call', async () => {
    const { deps, resolvers, api } = depsWith({
      resolveRepo: async () => {
        throw new ToolError("Repo 'x/y' is not in DevDigest. Known repos: acme/api (add it in the DevDigest UI).");
      },
    });
    const r = await getBlastRadius(deps, args, ctx);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Known repos');
    expect(resolvers.resolvePr).not.toHaveBeenCalled();
    expect(api.getPull).not.toHaveBeenCalled();
  });

  it('unknown PR → the error names the open PRs, no blast call', async () => {
    const { deps, api } = depsWith({
      resolvePr: async () => {
        throw new ToolError('PR #12 not found in acme/api. Open PRs: #3 (import PRs in the DevDigest UI).');
      },
    });
    const r = await getBlastRadius(deps, args, ctx);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('PR #12 not found');
    expect(text(r)).toContain('Open PRs');
    expect(api.getBlast).not.toHaveBeenCalled();
  });
});
