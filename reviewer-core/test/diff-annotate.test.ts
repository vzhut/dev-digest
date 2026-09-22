import { describe, it, expect } from 'vitest';
import { annotateDiff } from '../src/diff-annotate.js';

describe('annotateDiff', () => {
  it('numbers context and added lines with the real new-file line number; removed lines get a blank gutter', () => {
    // The exact shape that caused the bug: a model reading the raw (unnumbered)
    // text cited line 8 for a change that is really on line 4 of the new file —
    // counting the diff --git/---/+++/@@ header lines as if they were content.
    const raw = [
      'diff --git a/src/schemas.ts b/src/schemas.ts',
      '--- a/src/schemas.ts',
      '+++ b/src/schemas.ts',
      '@@ -1,7 +1,7 @@',
      " import { z } from 'zod';",
      '',
      ' /** doc comment */',
      "-export const RunStatus = z.enum(['queued', 'done']);",
      "+export const RunStatus = z.enum(['queued', 'done', 'cancelled']);",
      '',
      ' export const RunResponse = z.object({',
    ].join('\n');

    const lines = annotateDiff(raw).split('\n');

    expect(lines[0]).toBe('diff --git a/src/schemas.ts b/src/schemas.ts');
    expect(lines[3]).toBe('@@ -1,7 +1,7 @@');
    expect(lines[4]).toMatch(/^\s*1\s+import \{ z \}/);
    expect(lines[6]).toMatch(/^\s*3\s+.*doc comment/);
    // the removed line carries no new-file number
    expect(lines[7]).toMatch(/^\s+-export const RunStatus/);
    expect(/\d/.test(lines[7]!.split('-export')[0]!)).toBe(false);
    // the added line is correctly line 4 of the new file — not 8
    expect(lines[8]).toMatch(/^\s*4\s+\+export const RunStatus/);
    expect(lines[10]).toMatch(/^\s*6\s+.*export const RunResponse/);
  });

  it('resets numbering per file (multiple diff --git blocks) and per hunk', () => {
    const raw = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,2 +1,2 @@',
      ' one',
      '+two',
      'diff --git a/b.ts b/b.ts',
      '--- a/b.ts',
      '+++ b/b.ts',
      '@@ -5,1 +5,2 @@',
      ' five',
      '+six',
    ].join('\n');

    const lines = annotateDiff(raw).split('\n');
    expect(lines[4]).toMatch(/^\s*1\s+one/);
    expect(lines[5]).toMatch(/^\s*2\s+\+two/);
    expect(lines[10]).toMatch(/^\s*5\s+five/);
    expect(lines[11]).toMatch(/^\s*6\s+\+six/);
  });

  it('numbers a second hunk in the same file from its own @@ header', () => {
    const raw = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,2 +1,2 @@',
      ' one',
      ' two',
      '@@ -10,1 +10,2 @@',
      ' ten',
      '+eleven',
    ].join('\n');

    const lines = annotateDiff(raw).split('\n');
    expect(lines[4]).toMatch(/^\s*1\s+one/);
    expect(lines[5]).toMatch(/^\s*2\s+two/);
    expect(lines[7]).toMatch(/^\s*10\s+ten/);
    expect(lines[8]).toMatch(/^\s*11\s+\+eleven/);
  });

  it('passes non-diff lines through unnumbered ("\\ No newline", binary marker) and handles empty input', () => {
    expect(annotateDiff('')).toBe('');
    const raw = [
      'diff --git a/bin.png b/bin.png',
      'Binary files a/bin.png and b/bin.png differ',
    ].join('\n');
    expect(annotateDiff(raw)).toBe(raw);

    const withNoNewline = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
      '\\ No newline at end of file',
    ].join('\n');
    const lines = annotateDiff(withNoNewline).split('\n');
    expect(lines[6]).toMatch(/^\s+\\ No newline at end of file$/);
    expect(/\d/.test(lines[6]!.split('\\')[0]!)).toBe(false);
  });
});
