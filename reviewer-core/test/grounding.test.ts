import { describe, it, expect } from 'vitest';
import type { Finding, UnifiedDiff } from '@devdigest/shared';
import { buildLineIndex, groundFindings } from '../src/grounding.js';

const finding = (start: number, end: number, file = 'a.ts'): Finding => ({
  id: `${start}-${end}`,
  severity: 'WARNING',
  category: 'bug',
  title: 't',
  file,
  start_line: start,
  end_line: end,
  rationale: 'r',
  confidence: 0.9,
});

const hunk = (newStart: number, newLines: number, newLineNumbers: number[] = []) => ({
  file: 'a.ts',
  oldStart: 1,
  oldLines: 1,
  newStart,
  newLines,
  newLineNumbers,
});
const diffOf = (hunks: ReturnType<typeof hunk>[]): UnifiedDiff => ({
  raw: '',
  files: [{ path: 'a.ts', additions: 0, deletions: 0, hunks }],
});

describe('groundFindings keeps its behaviour on normal input', () => {
  const diff = diffOf([hunk(10, 3, [10, 11, 12])]);
  it('keeps overlapping ranges (also reversed) and drops the others', () => {
    const { kept, dropped } = groundFindings([finding(11, 20), finding(12, 12), finding(8, 10), finding(13, 15), finding(30, 20)], diff);
    expect(kept.map((f) => f.id)).toEqual(['11-20', '12-12', '8-10']);
    expect(dropped.map((d) => d.finding.id)).toEqual(['13-15', '30-20']);
  });
  it('a deletion-only hunk still grounds on its declared new line', () => {
    expect(groundFindings([finding(5, 5)], diffOf([hunk(5, 0)])).kept).toHaveLength(1);
  });
});

describe('model-controlled and header-controlled numbers cannot hang the gate', () => {
  it('a finding with an astronomical end_line is decided at once (kept when it overlaps, dropped when not)', () => {
    const diff = diffOf([hunk(10, 3, [10, 11, 12])]);
    expect(groundFindings([finding(1, 9e15)], diff).kept).toHaveLength(1);
    expect(groundFindings([finding(13, 9e15)], diff).kept).toHaveLength(0);
    expect(groundFindings([finding(9e15, 1)], diff).kept).toHaveLength(1);
  });

  it('header-only hunks declaring huge new ranges are clamped and budgeted, not expanded', () => {
    const hunks = Array.from({ length: 21_000 }, (_, i) => hunk(1 + i, 100_000));
    const index = buildLineIndex(diffOf(hunks));
    expect(index.get('a.ts')!.size).toBeLessThanOrEqual(100_000 + 1_000);
    const { kept } = groundFindings([finding(1, 1)], diffOf(hunks));
    expect(kept).toHaveLength(1);
  });

  it('a hunk with an unsafe start is skipped instead of looped over', () => {
    const index = buildLineIndex(diffOf([hunk(Number.MAX_SAFE_INTEGER + 10, 5), hunk(1, 2)]));
    expect([...index.get('a.ts')!]).toEqual([1, 2]);
  });
});
