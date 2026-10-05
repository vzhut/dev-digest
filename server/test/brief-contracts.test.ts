import { describe, it, expect } from 'vitest';
import { PrBrief, PrBriefResponse } from '@devdigest/shared';

const FULL = {
  intent: { intent: 'Add X', in_scope: ['a'], out_of_scope: ['b'], risk_areas: null },
  blast: { changed_symbols: [], downstream: [], summary: 'none' },
  risks: {
    risks: [
      { kind: 'logic', title: 'T', explanation: 'E', severity: 'high', file_refs: ['a.ts:3'] },
    ],
  },
  history: { history: [] },
  summary: 'A summary',
  review_focus: [{ file: 'a.ts', line: 3, reason: 'core change' }],
  head_sha: 'abc123',
  generated_at: '2026-10-02T00:00:00.000Z',
  model: 'm',
  usage: { llm_calls: 1, tokens_in: 100, tokens_out: 50, cost_usd: null, duration_ms: 1200 },
  inputs: {
    missing: [{ input: 'linked_issue', reason: 'none referenced' }],
    truncated: ['specs'],
    skipped: [],
    notes: null,
    input_tokens: 4000,
  },
  dropped_items: 0,
};

describe('PrBrief contract', () => {
  it('parses a full brief and one without the optional keys', () => {
    expect(PrBrief.safeParse(FULL).success).toBe(true);
    const minimal = {
      risks: { risks: [] },
      summary: 's',
      review_focus: [],
    };
    expect(PrBrief.safeParse(minimal).success).toBe(true);
    // A pre-existing stored row: intent/blast/history present, none of the new fields.
    const { intent, blast, risks, history } = FULL;
    expect(PrBrief.safeParse({ intent, blast, risks, history, summary: '', review_focus: [] }).success).toBe(true);
  });

  it('parses every response status', () => {
    for (const status of ['none', 'ready', 'generating'] as const) {
      const r = PrBriefResponse.safeParse({ status, stale: false, brief: status === 'ready' ? FULL : null });
      expect(r.success).toBe(true);
    }
    expect(PrBriefResponse.safeParse({ status: 'failed', stale: false, brief: null }).success).toBe(false);
  });

  it('rejects a review_focus line below 1', () => {
    const bad = { ...FULL, review_focus: [{ file: 'a.ts', line: 0, reason: 'x' }] };
    expect(PrBrief.safeParse(bad).success).toBe(false);
  });
});
