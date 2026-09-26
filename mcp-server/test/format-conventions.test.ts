import { describe, expect, it } from 'vitest';
import { buildConventionsResult } from '../src/format/conventions.js';
import { ok } from '../src/format/errors.js';
import { makeCandidate } from './fixtures/reviews.js';

const base = { repo: 'acme/api', scan: { sha: 'abc123' }, status: 'accepted' as const, limit: 30, format: 'concise' as const };

describe('buildConventionsResult', () => {
  it('scan null → not_extracted with an Extract hint', () => {
    const r = buildConventionsResult({ ...base, scan: null, candidates: [] });
    expect(r.status).toBe('not_extracted');
    expect(r.hint).toContain('Extract');
  });

  it('3 pending / 0 accepted → none_accepted with pending:3', () => {
    const cands = [0, 1, 2].map((i) => makeCandidate(i, { status: 'pending' }));
    const r = buildConventionsResult({ ...base, candidates: cands });
    expect(r).toMatchObject({ status: 'none_accepted', pending: 3, scan_sha: 'abc123' });
    expect(r.hint).toContain('status=pending');
    expect(r.conventions).toBeUndefined();
  });

  it('60 accepted candidates → concise output stays compact (≤ 5,000 chars), limited to 30 with a hint', () => {
    const cands = Array.from({ length: 60 }, (_, i) => makeCandidate(i));
    const r = buildConventionsResult({ ...base, candidates: cands });
    const text = ok(r as unknown as Record<string, unknown>, 'conventions').content[0]?.text ?? '';
    expect(r).toMatchObject({ status: 'ok', shown: 30, total: 60 });
    expect(r.hint).toBe('showing 30 of 60 — raise limit (max 100)');
    expect(r.conventions?.[0]).toEqual({ category: expect.any(String), rule: expect.any(String), evidence: expect.stringMatching(/^src\/.+:\d+-\d+$/) });
    expect(text.length).toBeLessThanOrEqual(5_000);
    expect(text).not.toContain('null');
  });

  it('filters by status, sorts accepted first, and shows status for "all"', () => {
    const cands = [
      makeCandidate(0, { status: 'pending', category: 'api' }),
      makeCandidate(1, { status: 'accepted', category: 'testing' }),
      makeCandidate(2, { status: 'rejected' }),
    ];
    expect(buildConventionsResult({ ...base, candidates: cands, status: 'pending' }).total).toBe(1);
    const all = buildConventionsResult({ ...base, candidates: cands, status: 'all' });
    expect(all.conventions?.map((c) => c.status)).toEqual(['accepted', 'pending', 'rejected']);
  });

  it('detailed adds snippet (capped), url and status; text is sanitised', () => {
    const c = makeCandidate(0, { rule: '\u001b[31mUse\u0000 named exports', evidence_snippet: 'y'.repeat(900) });
    const r = buildConventionsResult({ ...base, candidates: [c], format: 'detailed' });
    const item = r.conventions?.[0];
    expect(item?.rule).toBe('Use named exports');
    expect(item?.snippet?.length).toBeLessThanOrEqual(400);
    expect(item).toMatchObject({ status: 'accepted', url: expect.stringContaining('github.com') });
  });
});
