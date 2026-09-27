import { describe, it, expect, vi } from 'vitest';
import { PrHistoryService } from '../src/modules/blast/history-service.js';
import type { PullContext } from '../src/modules/blast/repository.js';
import type { PriorPr } from '../src/adapters/github/history.js';
import { MockGitHubHistory } from '../src/adapters/mocks.js';
import { ConfigError, ExternalServiceError, NotFoundError } from '../src/platform/errors.js';
import { HISTORY_MAX_ITEMS } from '../src/modules/blast/constants.js';

const CTX: PullContext = {
  prId: 'pr1',
  number: 7,
  repoId: 'repo1',
  repoFullName: 'acme/api',
  base: 'main',
  headSha: 'head1',
  files: ['src/a.ts', 'src/b.ts'],
};

const pr = (n: number, mergedAt: string, over: Partial<PriorPr> = {}): PriorPr => ({
  number: n,
  title: `PR #${n}`,
  mergedAt,
  author: 'octocat',
  filesOverlap: ['src/a.ts'],
  ...over,
});

function setup(over: {
  ctx?: PullContext | undefined;
  history?: MockGitHubHistory;
  historyFactory?: () => Promise<MockGitHubHistory>;
  now?: Date;
} = {}) {
  const findPullContext = vi.fn(async () => ('ctx' in over ? over.ctx : CTX));
  const mockHistory = over.history ?? new MockGitHubHistory({ results: [pr(1, '2026-01-01T00:00:00Z')] });
  let now = over.now ?? new Date('2026-02-01T00:00:00Z');
  const historyFactory = over.historyFactory ?? (async () => mockHistory);
  const log = { info: vi.fn() };
  const service = new PrHistoryService({
    repo: { findPullContext },
    history: historyFactory,
    now: () => now,
    log,
  });
  return {
    service,
    findPullContext,
    mockHistory,
    log,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe('PrHistoryService.getHistory', () => {
  it('caches within the TTL (zero adapter calls) and re-fetches after it expires', async () => {
    const mockHistory = new MockGitHubHistory({ results: [pr(1, '2026-01-01T00:00:00Z')] });
    const t = setup({ history: mockHistory });

    const first = await t.service.getHistory('ws1', 'pr1');
    expect(mockHistory.calls).toHaveLength(1);
    expect(first.history).toHaveLength(1);

    // Second call within the TTL: zero further adapter calls, same result.
    const second = await t.service.getHistory('ws1', 'pr1');
    expect(mockHistory.calls).toHaveLength(1);
    expect(second).toEqual(first);

    // After the TTL: exactly one more adapter call.
    t.advance(15 * 60 * 1000 + 1);
    await t.service.getHistory('ws1', 'pr1');
    expect(mockHistory.calls).toHaveLength(2);
  });

  it('excludes the current PR number and orders newest merged_at first', async () => {
    const mockHistory = new MockGitHubHistory({
      results: [
        pr(7, '2026-01-05T00:00:00Z'), // current PR — excluded
        pr(2, '2026-01-01T00:00:00Z'),
        pr(3, '2026-01-10T00:00:00Z'),
      ],
    });
    const t = setup({ history: mockHistory });
    const out = await t.service.getHistory('ws1', 'pr1');
    expect(out.history.map((h) => h.pr_number)).toEqual([3, 2]);
  });

  it('caps at HISTORY_MAX_ITEMS', async () => {
    const items = Array.from({ length: HISTORY_MAX_ITEMS + 4 }, (_, i) =>
      pr(100 + i, `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    );
    const mockHistory = new MockGitHubHistory({ results: items });
    const t = setup({ history: mockHistory });
    const out = await t.service.getHistory('ws1', 'pr1');
    expect(out.history).toHaveLength(HISTORY_MAX_ITEMS);
  });

  it('missing token → degraded no_github_token, not cached', async () => {
    const mockHistory = new MockGitHubHistory({ results: [pr(1, '2026-01-01T00:00:00Z')] });
    let calls = 0;
    const t = setup({
      history: mockHistory,
      historyFactory: async () => {
        calls++;
        throw new ConfigError('GITHUB_TOKEN is not configured');
      },
    });
    const out = await t.service.getHistory('ws1', 'pr1');
    expect(out).toEqual({ history: [], degraded: true, reason: 'no_github_token' });

    // Re-call: not cached, tries again.
    await t.service.getHistory('ws1', 'pr1');
    expect(calls).toBe(2);
  });

  it('GitHub failure → degraded github_error, not cached', async () => {
    const mockHistory = new MockGitHubHistory({ error: new ExternalServiceError('boom') });
    const t = setup({ history: mockHistory });

    const out = await t.service.getHistory('ws1', 'pr1');
    expect(out).toEqual({ history: [], degraded: true, reason: 'github_error' });
    expect(mockHistory.calls).toHaveLength(1);

    // Re-call: not cached, adapter is called again.
    await t.service.getHistory('ws1', 'pr1');
    expect(mockHistory.calls).toHaveLength(2);
  });

  it('unknown PR → NotFoundError, no adapter call', async () => {
    const mockHistory = new MockGitHubHistory();
    const t = setup({ ctx: undefined, history: mockHistory });
    await expect(t.service.getHistory('ws1', 'nope')).rejects.toBeInstanceOf(NotFoundError);
    expect(mockHistory.calls).toHaveLength(0);
  });
});
