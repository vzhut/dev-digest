import { describe, it, expect } from 'vitest';
import type { BlastRadius } from '@devdigest/shared';
import {
  blastFiles,
  callerFiles,
  formatBriefLog,
  groundBrief,
  hunkRanges,
  isStale,
  normalizeRepoPath,
  parseFileRef,
  toDiffStats,
} from '../src/modules/brief/helpers.js';
import { BriefLlmOutput, BriefLlmOutputWire } from '../src/modules/brief/output-schema.js';

const risk = (file_refs: string[], title = 'r') => ({
  kind: 'k', title, explanation: 'e', severity: 'high' as const, file_refs,
});
const valid = {
  summary: 'does a thing',
  risks: [risk(['src/a.ts'])],
  review_focus: [{ file: 'src/a.ts', line: 3, reason: 'why' }],
};

describe('BriefLlmOutput (AC-17)', () => {
  it('accepts valid output and rejects each bound', () => {
    expect(BriefLlmOutput.safeParse(valid).success).toBe(true);
    const bad = (o: object) => BriefLlmOutput.safeParse({ ...valid, ...o }).success;
    expect(bad({ summary: undefined })).toBe(false);
    expect(bad({ summary: '' })).toBe(false);
    expect(bad({ summary: 'x'.repeat(601) })).toBe(false);
    expect(bad({ risks: [{ ...risk(['a']), severity: 'critical' }] })).toBe(false);
    expect(bad({ risks: [risk([])] })).toBe(false);
    expect(bad({ risks: [risk(['a', 'b', 'c', 'd'])] })).toBe(false);
    expect(bad({ risks: Array.from({ length: 7 }, () => risk(['a'])) })).toBe(false);
    expect(bad({ review_focus: [{ file: 'a', line: 0, reason: 'r' }] })).toBe(false);
    expect(bad({ review_focus: Array.from({ length: 7 }, () => ({ file: 'a', line: 1, reason: 'r' })) })).toBe(false);
  });

  it('the wire shape carries the same fields without bounds', () => {
    expect(BriefLlmOutputWire.safeParse({ ...valid, summary: 'x'.repeat(900) }).success).toBe(true);
  });
});

describe('hunkRanges / toDiffStats (AC-9, AC-10)', () => {
  it('reads numeric new-side ranges only and skips deletion-only hunks', () => {
    const patch = [
      '@@ -1,2 +10,4 @@ function SENTINEL() {',
      '+code',
      '@@ -20 +30 @@',
      '@@ -40,3 +50,0 @@ ctx',
      '@@ -0,0 +1,5 @@',
    ].join('\n');
    expect(hunkRanges(patch)).toEqual([
      { start: 10, end: 13 },
      { start: 30, end: 30 },
      { start: 1, end: 5 },
    ]);
    expect(hunkRanges(null)).toEqual([]);
    expect(JSON.stringify(toDiffStats([{ path: 'a.test.ts', additions: 1, deletions: 0, patch }]))).not.toContain('SENTINEL');
    expect(toDiffStats([{ path: 'a.test.ts', additions: 1, deletions: 0, patch: null }])[0]!.role).toBe('tests');
  });
});

describe('paths', () => {
  it('normalises a leading ./ and / and splits :line / :start-end suffixes', () => {
    expect(normalizeRepoPath('./src/a.ts')).toBe('src/a.ts');
    expect(normalizeRepoPath('/src/a.ts')).toBe('src/a.ts');
    expect(parseFileRef('./src/a.ts:12')).toEqual({ path: 'src/a.ts', suffix: ':12' });
    expect(parseFileRef('src/a.ts:12-20')).toEqual({ path: 'src/a.ts', suffix: ':12-20' });
    expect(parseFileRef('src/a.ts')).toEqual({ path: 'src/a.ts', suffix: '' });
  });
});

describe('blast files', () => {
  const b: BlastRadius = {
    changed_symbols: [{ name: 's', file: 'src/decl.ts', kind: 'function' }],
    downstream: [
      { symbol: 's', file: 'src/decl.ts', callers: [{ name: 'a', file: 'src/c1.ts', line: 1 }, { name: 'b', file: './src/c1.ts', line: 2 }], endpoints_affected: [], crons_affected: [] },
      { symbol: 't', file: 'src/decl2.ts', callers: [{ name: 'c', file: 'src/c2.ts', line: 1 }], endpoints_affected: [], crons_affected: [] },
    ],
    summary: 's',
  };
  it('callerFiles de-duplicates; blastFiles adds declaring files', () => {
    expect(callerFiles(b)).toEqual(['src/c1.ts', 'src/c2.ts']);
    expect(blastFiles(b).sort()).toEqual(['src/c1.ts', 'src/c2.ts', 'src/decl.ts', 'src/decl2.ts']);
    expect(callerFiles(null)).toEqual([]);
    expect(blastFiles(undefined)).toEqual([]);
  });
});

describe('groundBrief (AC-18, D1)', () => {
  it('keeps valid, drops an all-invalid risk whole, strips an invalid ref: dropped = 2', () => {
    const out = BriefLlmOutput.parse({
      summary: 's',
      risks: [
        risk(['src/a.ts:5'], 'valid'),
        risk(['src/invented.ts'], 'invented'),
        risk(['src/a.ts', 'src/ghost.ts'], 'mixed'),
      ],
      review_focus: [],
    });
    const g = groundBrief(out, ['src/a.ts']);
    expect(g.risks.map((r) => r.title)).toEqual(['valid', 'mixed']);
    expect(g.risks[1]!.file_refs).toEqual(['src/a.ts']);
    expect(g.dropped).toBe(2);
  });

  it('accepts a ./-prefixed path, counts dropped focus items, grounds on blast files too', () => {
    const out = BriefLlmOutput.parse({
      summary: 's',
      risks: [risk(['./src/a.ts:1-3'])],
      review_focus: [
        { file: './src/a.ts', line: 2, reason: 'r' },
        { file: 'src/caller.ts', line: 9, reason: 'r' },
        { file: 'src/nope.ts', line: 1, reason: 'r' },
      ],
    });
    const g = groundBrief(out, ['src/a.ts', 'src/caller.ts']);
    expect(g.risks[0]!.file_refs).toEqual(['src/a.ts:1-3']);
    expect(g.review_focus.map((f) => f.file)).toEqual(['src/a.ts', 'src/caller.ts']);
    expect(g.dropped).toBe(1);
  });

  it('only invented paths: nothing kept, every item counted once', () => {
    const out = BriefLlmOutput.parse({
      summary: 's',
      risks: [risk(['x.ts', 'y.ts'])],
      review_focus: [{ file: 'z.ts', line: 1, reason: 'r' }],
    });
    expect(groundBrief(out, [])).toMatchObject({ risks: [], review_focus: [], dropped: 2 });
  });
});

describe('isStale (AC-33) and formatBriefLog (AC-35)', () => {
  it('compares head SHAs', () => {
    expect(isStale('abc', 'abc')).toBe(false);
    expect(isStale('abc', 'def')).toBe(true);
    expect(isStale(null, 'def')).toBe(true);
  });

  it('formats the log line with /12000 and unknown cost', () => {
    const base = {
      prId: 'p1', headSha: 'a1b2c3d4e5f6', ok: true, llmCalls: 1 as const, inputTokens: 8200, tokensIn: 8200,
      tokensOut: 1300, costUsd: 0.014, model: 'openai/gpt-4.1', durationMs: 9000, dropped: 2, missing: ['intent', 'blast'],
    };
    expect(formatBriefLog(base)).toBe(
      'brief: generated pr=p1 head=a1b2c3d ok=true llm_calls=1 input_tokens=8200/12000 tokens=8200/1300 ' +
        'cost=$0.0140 model=openai/gpt-4.1 duration_ms=9000 dropped=2 missing=intent,blast',
    );
    const failed = formatBriefLog({ ...base, ok: false, costUsd: null, missing: [] });
    expect(failed).toContain('ok=false');
    expect(failed).toContain('cost=unknown');
    expect(failed).toContain('missing=none');
  });
});
