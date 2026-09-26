import { describe, it, expect } from 'vitest';
import { buildSmartDiff, latestReviewFindings } from '../src/modules/reviews/smart-diff/build.js';

const f = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions });

describe('buildSmartDiff', () => {
  it('orders groups core, tests, wiring, docs, boilerplate and omits empty ones', () => {
    const full = buildSmartDiff(
      [f('pnpm-lock.yaml'), f('README.md'), f('src/index.ts'), f('src/a.test.ts'), f('src/a.ts')],
      [],
    );
    expect(full.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);

    const partial = buildSmartDiff([f('README.md'), f('src/a.ts')], []);
    expect(partial.groups.map((g) => g.role)).toEqual(['core', 'docs']);
    expect(buildSmartDiff([], []).groups).toEqual([]);
  });

  it('sorts files by path, dedups + sorts finding lines, sums total_lines', () => {
    const out = buildSmartDiff(
      [f('src/b.ts', 3, 1), f('src/a.ts', 2, 2)],
      [
        { file: 'src/a.ts', start_line: 9 },
        { file: 'src/a.ts', start_line: 2 },
        { file: 'src/a.ts', start_line: 9 },
        { file: 'src/other.ts', start_line: 1 },
      ],
    );
    const core = out.groups[0]!;
    expect(core.files.map((x) => x.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(core.files[0]!.finding_lines).toEqual([2, 9]);
    expect(core.files[1]!.finding_lines).toEqual([]);
    expect(out.split_suggestion).toEqual({ too_big: false, total_lines: 8, proposed_splits: [] });
    expect(core.files[0]).not.toHaveProperty('pseudocode_summary');
  });
});

describe('latestReviewFindings', () => {
  const a = { file: 'a.ts', start_line: 1 };
  const b = { file: 'b.ts', start_line: 2 };

  it('returns [] with no review', () => {
    expect(latestReviewFindings([])).toEqual([]);
    expect(latestReviewFindings([{ kind: 'summary', findings: [a] }])).toEqual([]);
  });

  it('uses only the newest kind=review row (input is newest-first), ignoring summaries', () => {
    const rows = [
      { kind: 'summary', findings: [a] },
      { kind: 'review', findings: [b] },
      { kind: 'review', findings: [a] },
    ];
    expect(latestReviewFindings(rows)).toEqual([b]);
  });
});
