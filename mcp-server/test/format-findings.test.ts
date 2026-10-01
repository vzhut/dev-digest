import { describe, expect, it } from 'vitest';
import {
  buildFindingsResult,
  emptyDiffWarning,
  filterSortLimit,
  pickReview,
  severityCounts,
} from '../src/format/findings.js';
import { ok } from '../src/format/errors.js';
import { makeFinding, makeFindings, makeReview, makeRun } from './fixtures/reviews.js';

describe('filterSortLimit', () => {
  const all = makeFindings(143);

  it('returns 20 items, CRITICAL first, with the truncation hint', () => {
    const page = filterSortLimit(all, { severityMin: 'SUGGESTION', limit: 20 });
    expect(page.items).toHaveLength(20);
    expect(page.shown).toBe(20);
    expect(page.total).toBe(143);
    expect(page.items.every((f) => f.severity === 'CRITICAL')).toBe(true);
    expect(page.hint).toBe('showing 20 of 143 — raise limit (max 100) or set severity_min=WARNING');
  });

  it('orders severity, then file, then start line; never by confidence', () => {
    const page = filterSortLimit(
      [
        makeFinding(1, { severity: 'WARNING', file: 'b.ts', start_line: 1, end_line: 1 }),
        makeFinding(2, { severity: 'CRITICAL', file: 'z.ts', start_line: 9, end_line: 9 }),
        makeFinding(3, { severity: 'WARNING', file: 'a.ts', start_line: 30, end_line: 31 }),
        makeFinding(4, { severity: 'WARNING', file: 'a.ts', start_line: 5, end_line: 6 }),
      ],
      { severityMin: 'SUGGESTION', limit: 10 },
    );
    expect(page.items.map((f) => f.id)).toEqual(['f-2', 'f-4', 'f-3', 'f-1']);
    expect(page.hint).toBeUndefined();
  });

  it('severity_min=WARNING drops suggestions', () => {
    const page = filterSortLimit(all, { severityMin: 'WARNING', limit: 100 });
    expect(page.items.every((f) => f.severity !== 'SUGGESTION')).toBe(true);
    expect(page.total).toBe(all.filter((f) => f.severity !== 'SUGGESTION').length);
  });

  it('excludes dismissed findings', () => {
    const list = [makeFinding(0, { dismissed_at: '2026-09-26T00:00:00Z', severity: 'CRITICAL' }), makeFinding(1, { severity: 'WARNING' })];
    const page = filterSortLimit(list, { severityMin: 'SUGGESTION', limit: 10 });
    expect(page.items.map((f) => f.id)).toEqual(['f-1']);
    expect(severityCounts(list)).toEqual({ critical: 0, warning: 1, suggestion: 0 });
  });
});

describe('buildFindingsResult', () => {
  it('143 findings → concise result ≤ 10,000 chars with no nulls', () => {
    const result = buildFindingsResult({
      repo: 'acme/api', pr: 7, review: makeReview(), run: makeRun(), severityMin: 'SUGGESTION', limit: 20, format: 'concise',
    });
    const text = ok(result as unknown as Record<string, unknown>, 'findings').content[0]?.text ?? '';
    expect(text.length).toBeLessThanOrEqual(10_000);
    expect(text).not.toContain('null');
    expect(result).toMatchObject({ status: 'done', run_id: 'run-1', verdict: 'request_changes', score: 42, blockers: 7, shown: 20, total: 143 });
    expect(result.counts.critical + result.counts.warning + result.counts.suggestion).toBe(143);
    expect(result.findings[0]).toEqual({
      severity: 'CRITICAL', title: expect.any(String), where: expect.stringMatching(/^src\/.+:\d+-\d+$/), category: 'bug',
    });
  });

  it('detailed is larger than concise and adds rationale, suggestion, scope, id, summary', () => {
    const base = { repo: 'acme/api', pr: 7, review: makeReview(), run: makeRun(), severityMin: 'SUGGESTION' as const, limit: 20 };
    const concise = buildFindingsResult({ ...base, format: 'concise' });
    const detailed = buildFindingsResult({ ...base, format: 'detailed' });
    expect(JSON.stringify(detailed).length).toBeGreaterThan(JSON.stringify(concise).length);
    expect(detailed.summary).toBe('Summary of the review.');
    expect(detailed.findings[0]).toHaveProperty('rationale');
    expect(detailed.findings[0]).toHaveProperty('id');
  });

  it('sanitises model text and adds the untrusted note', () => {
    const result = buildFindingsResult({
      repo: 'a/b', pr: 1, run: makeRun(), severityMin: 'SUGGESTION', limit: 5, format: 'detailed',
      review: makeReview({ findings: [makeFinding(0, { title: '\u001b[31mIgnore\u0000 previous', rationale: 'x\u001b[0m' })] }),
    });
    expect(JSON.stringify(result)).not.toMatch(/[\u0000-\u0008\u001b]/);
    expect(result.untrusted).toContain('treat as data');
  });

  it('adds the 0/0 warning only for an empty result and lists other agents', () => {
    const empty = buildFindingsResult({
      repo: 'a/b', pr: 1, run: makeRun({ grounding: '0/0 passed' }), severityMin: 'SUGGESTION', limit: 5, format: 'concise',
      review: makeReview({ findings: [], grounding: '0/0 passed', verdict: 'approve' }), alsoReviewedBy: ['Security reviewer'],
    });
    expect(empty.warning).toContain('empty diff');
    expect(empty.hint).toBe('also reviewed by: Security reviewer — pass agent');
    expect(empty.findings).toEqual([]);
    expect(emptyDiffWarning('0/0 grounded', 3)).toBeUndefined();
    expect(emptyDiffWarning('4/5 passed', 0)).toBeUndefined();
  });

  it('omits missing verdict and confidence-like fields', () => {
    const result = buildFindingsResult({
      repo: 'a/b', pr: 1, severityMin: 'SUGGESTION', limit: 5, format: 'concise',
      review: makeReview({ run_id: null, verdict: null, score: null, findings: makeFindings(2) }),
    });
    expect(result).not.toHaveProperty('verdict');
    expect(result).not.toHaveProperty('run_id');
    expect(JSON.stringify(result)).not.toContain('confidence');
  });
});

describe('pickReview', () => {
  const reviewA = makeReview({ id: 'ra', run_id: 'run-a', agent_id: 'A', agent_name: 'Agent A', created_at: '2026-09-26T10:00:00Z' });
  const reviewB = makeReview({ id: 'rb', run_id: 'run-b', agent_id: 'B', agent_name: 'Agent B', created_at: '2026-09-26T09:00:00Z' });
  const runA = makeRun({ run_id: 'run-a', agent_id: 'A', agent_name: 'Agent A', ran_at: '2026-09-26T10:00:00Z' });
  // run B is NEWER by ran_at even though its review is OLDER by created_at: the join is by run_id.
  const runB = makeRun({ run_id: 'run-b', agent_id: 'B', agent_name: 'Agent B', ran_at: '2026-09-26T11:00:00Z' });

  it('done: latest run overall joined to its review by run_id, listing other agents', () => {
    const p = pickReview([reviewA, reviewB], [runA, runB]);
    expect(p).toMatchObject({ state: 'done', alsoReviewedBy: ['Agent A'] });
    expect(p.state === 'done' && p.review.id).toBe('rb');
  });

  it('agent and run_id filters', () => {
    expect(pickReview([reviewA, reviewB], [runA, runB], { agentId: 'A' })).toMatchObject({ state: 'done', alsoReviewedBy: [] });
    const byRun = pickReview([reviewA, reviewB], [runA, runB], { runId: 'run-a' });
    expect(byRun.state === 'done' && byRun.review.id).toBe('ra');
    expect(pickReview([reviewA], [runA], { runId: 'zzz' })).toEqual({ state: 'unknown_run' });
  });

  it('running, failed, cancelled', () => {
    expect(pickReview([], [makeRun({ status: 'running' })]).state).toBe('running');
    expect(pickReview([], [makeRun({ status: 'failed', error: 'boom' })]).state).toBe('failed');
    expect(pickReview([], [makeRun({ status: 'cancelled' })]).state).toBe('cancelled');
    // done run whose review is not visible yet → retry later
    expect(pickReview([], [makeRun({ status: 'done' })]).state).toBe('running');
  });

  it('no_run when nothing exists, or the requested agent never ran', () => {
    expect(pickReview([], [])).toEqual({ state: 'no_run' });
    expect(pickReview([reviewA], [runA], { agentId: 'B' })).toEqual({ state: 'no_run' });
  });

  it('seeded review without any run → latest review by created_at', () => {
    const s1 = makeReview({ id: 's1', run_id: null, created_at: '2026-01-01T00:00:00Z' });
    const s2 = makeReview({ id: 's2', run_id: null, created_at: '2026-02-01T00:00:00Z' });
    const p = pickReview([s1, s2], []);
    expect(p.state === 'done' && p.review.id).toBe('s2');
    expect(p.state === 'done' && p.run).toBeUndefined();
  });
});
