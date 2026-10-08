import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import {
  caseMetaFrom,
  caseName,
  expectationFromFinding,
  isExpectationGrounded,
  synthesizeFrozenDiff,
} from './frozen-input.js';

const PATCH = ['@@ -0,0 +1,4 @@', '+const a = 1;', '+const b = 2;', '+const c = 3;', '+const d = 4;'].join('\n');

const bigHunk = (start: number, lines: number) =>
  [`@@ -${start},0 +${start},${lines} @@`, ...Array.from({ length: lines }, (_, i) => `+line ${start + i}`)].join('\n');

describe('synthesizeFrozenDiff', () => {
  it('uses the same synthetic header as the reviewer and keeps hunk headers verbatim', () => {
    const r = synthesizeFrozenDiff('src/a.ts', PATCH, { start_line: 2, end_line: 3 });
    expect(r).toEqual({
      ok: true,
      trimmed: false,
      diff: ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', PATCH].join('\n'),
    });
    if (!r.ok) throw new Error('unreachable');
    const parsed = parseUnifiedDiff(r.diff);
    expect(parsed.files[0]?.path).toBe('src/a.ts');
    expect(parsed.files[0]?.hunks[0]).toMatchObject({ newStart: 1, newLines: 4 });
  });

  it('is diff_unavailable for a null, empty or binary patch and for an unsafe path', () => {
    const focus = { start_line: 1, end_line: 1 };
    for (const patch of [null, undefined, '', '   \n', 'Binary files a/x and b/x differ']) {
      expect(synthesizeFrozenDiff('a.ts', patch, focus)).toMatchObject({ ok: false, code: 'diff_unavailable' });
    }
    expect(synthesizeFrozenDiff('a.ts\n+++ b/evil', PATCH, focus)).toMatchObject({ ok: false });
    expect(synthesizeFrozenDiff('', PATCH, focus)).toMatchObject({ ok: false });
  });

  it('over 400 changed lines keeps only the hunks around the finding (+- 1 neighbour)', () => {
    const patch = [bigHunk(1, 150), bigHunk(300, 150), bigHunk(600, 150), bigHunk(900, 150), bigHunk(1200, 150)].join('\n');
    const r = synthesizeFrozenDiff('big.ts', patch, { start_line: 610, end_line: 612 });
    if (!r.ok) throw new Error('expected ok');
    expect(r.trimmed).toBe(true);
    const parsed = parseUnifiedDiff(r.diff);
    expect(parsed.files[0]?.hunks.map((h) => h.newStart)).toEqual([300, 600, 900]);
  });

  it('keeps everything at exactly the cap', () => {
    const r = synthesizeFrozenDiff('x.ts', [bigHunk(1, 200), bigHunk(500, 200)].join('\n'), {
      start_line: 5,
      end_line: 5,
    });
    expect(r).toMatchObject({ ok: true, trimmed: false });
  });
});

describe('isExpectationGrounded', () => {
  const frozen = synthesizeFrozenDiff('src/a.ts', PATCH, { start_line: 2, end_line: 2 });
  if (!frozen.ok) throw new Error('fixture');
  const diff = parseUnifiedDiff(frozen.diff);
  const exp = (start: number, end: number, file = 'src/a.ts') => ({
    type: 'must_find' as const,
    file,
    start_line: start,
    end_line: end,
  });

  it('accepts lines inside a hunk and rejects lines outside every hunk or in another file', () => {
    expect(isExpectationGrounded(diff, exp(2, 3))).toBe(true);
    expect(isExpectationGrounded(diff, exp(4, 9))).toBe(true); // partial overlap is still grounded
    expect(isExpectationGrounded(diff, exp(50, 60))).toBe(false);
    expect(isExpectationGrounded(diff, exp(2, 3, 'src/other.ts'))).toBe(false);
  });

  it('rejects an expectation whose hunk was trimmed away by the cap', () => {
    const patch = [bigHunk(1, 250), bigHunk(900, 250), bigHunk(2000, 250), bigHunk(3000, 250)].join('\n');
    const r = synthesizeFrozenDiff('big.ts', patch, { start_line: 10, end_line: 10 });
    if (!r.ok) throw new Error('fixture');
    const parsed = parseUnifiedDiff(r.diff);
    expect(isExpectationGrounded(parsed, exp(10, 10, 'big.ts'))).toBe(true);
    expect(isExpectationGrounded(parsed, exp(3010, 3010, 'big.ts'))).toBe(false);
  });
});

describe('expectation, name and meta', () => {
  const finding = {
    file: 'src/config.ts',
    startLine: 12,
    endLine: 14,
    title: 'Hardcoded Stripe secret key',
    category: 'security',
    severity: 'CRITICAL',
  };

  it('accepted → must_find, dismissed → must_not_flag, with lines and labels', () => {
    expect(expectationFromFinding(finding, 'accepted')).toEqual({
      type: 'must_find',
      file: 'src/config.ts',
      start_line: 12,
      end_line: 14,
      label: { title: 'Hardcoded Stripe secret key', category: 'security', severity: 'CRITICAL' },
    });
    expect(expectationFromFinding(finding, 'dismissed').type).toBe('must_not_flag');
  });

  it('names a case <type>-<ascii slug> capped at 60 characters', () => {
    expect(caseName('must_find', finding.title)).toBe('must_find-hardcoded-stripe-secret-key');
    expect(caseName('must_not_flag', 'Ünïcode — "quotes" & <tags>!')).toBe('must_not_flag-unicode-quotes-tags');
    expect(caseName('must_find', '!!!')).toBe('must_find-finding');
    const long = caseName('must_find', 'word '.repeat(40));
    expect(long.slice('must_find-'.length).length).toBeLessThanOrEqual(60);
    expect(long.endsWith('-')).toBe(false);
  });

  it('maps provenance to the snake_case meta', () => {
    expect(
      caseMetaFrom({
        findingId: 'f',
        reviewId: 'r',
        runId: null,
        repo: 'acme/api',
        prNumber: 482,
        headSha: 'abc',
        prTitle: 'T',
        prBody: null,
      }),
    ).toEqual({
      source_finding_id: 'f',
      source_review_id: 'r',
      source_run_id: null,
      repo: 'acme/api',
      pr_number: 482,
      head_sha: 'abc',
      pr_title: 'T',
      pr_body: null,
    });
  });
});
