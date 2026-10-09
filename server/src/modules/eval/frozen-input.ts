import type {
  EvalCaseMeta,
  EvalExpectation,
  EvalExpectationInput,
  EvalExpectationType,
  Finding,
  UnifiedDiff,
} from '@devdigest/shared';
import { groundFindings } from '@devdigest/reviewer-core';
import {
  CASE_NAME_SLUG_MAX,
  FROZEN_DIFF_MAX_CHANGED_LINES,
  MAX_EXPECTATION_LINE,
  MAX_EXPECTATION_SPAN,
  MAX_HUNK_LINES,
} from './constants.js';

/**
 * Frozen case input — pure helpers that turn a decided finding and its file's stored patch into the
 * immutable input of an eval case. File paths come from the PR (attacker-controlled): they are only
 * compared and embedded as diff header text, never used to touch the filesystem.
 */

export type FrozenDiffResult =
  | { ok: true; diff: string; trimmed: boolean }
  | { ok: false; code: 'diff_unavailable'; reason: string };

interface PatchHunk {
  start: number;
  end: number;
  lines: string[];
  changed: number;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function splitHunks(patch: string): PatchHunk[] {
  const hunks: PatchHunk[] = [];
  let current: PatchHunk | null = null;
  for (const line of patch.split('\n')) {
    const header = line.match(HUNK_HEADER);
    if (header) {
      const start = Number(header[1]);
      const count = header[2] === undefined ? 1 : Number(header[2]);
      current = { start, end: start + Math.max(count, 1) - 1, lines: [line], changed: 0 };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
    if ((line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
      current.changed += 1;
    }
  }
  return hunks;
}

/**
 * The finding's single-file diff with the same synthetic header the reviewer uses for stored
 * patches (`diffFromPrFiles`), hunks verbatim so new-side line numbers are unchanged. Past
 * `FROZEN_DIFF_MAX_CHANGED_LINES` changed lines only the hunks intersecting the finding plus one
 * neighbour on each side are kept. A null / empty / binary patch, or an unsafe path, is
 * `diff_unavailable` (a typed result, not a throw).
 */
export function synthesizeFrozenDiff(
  path: string,
  patch: string | null | undefined,
  focus: { start_line: number; end_line: number },
): FrozenDiffResult {
  if (!path || CONTROL_CHARS.test(path)) {
    return { ok: false, code: 'diff_unavailable', reason: 'file path is empty or contains control characters' };
  }
  if (!patch || !patch.trim()) {
    return { ok: false, code: 'diff_unavailable', reason: 'no patch is stored for this file' };
  }
  if (patch.startsWith('Binary files') || patch.includes('GIT binary patch')) {
    return { ok: false, code: 'diff_unavailable', reason: 'binary file' };
  }
  const hunks = splitHunks(patch);
  if (hunks.length === 0) {
    return { ok: false, code: 'diff_unavailable', reason: 'the patch has no hunks' };
  }

  const changed = hunks.reduce((n, h) => n + h.changed, 0);
  let kept = hunks;
  let trimmed = false;
  if (changed > FROZEN_DIFF_MAX_CHANGED_LINES) {
    const lo = Math.min(focus.start_line, focus.end_line);
    const hi = Math.max(focus.start_line, focus.end_line);
    const keep = new Set<number>();
    hunks.forEach((h, i) => {
      if (h.start <= hi && h.end >= lo) {
        keep.add(i - 1);
        keep.add(i);
        keep.add(i + 1);
      }
    });
    kept = hunks.filter((_, i) => keep.has(i));
    trimmed = true;
  }

  const body = kept.flatMap((h) => h.lines).join('\n');
  const diff = [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, body].join('\n');
  return { ok: true, diff, trimmed };
}

const inBounds = (n: number) => Number.isSafeInteger(n) && n >= 1 && n <= MAX_EXPECTATION_LINE;

/** Both lines are sane integers and the range is not absurdly wide. */
function boundedExpectation(e: { start_line: number; end_line: number }): boolean {
  return inBounds(e.start_line) && inBounds(e.end_line) && Math.abs(e.end_line - e.start_line) <= MAX_EXPECTATION_SPAN;
}

/** A hunk header declaring an enormous new-side length (`@@ -1 +1,999999999 @@`). */
function hasOversizedHunk(diff: UnifiedDiff): boolean {
  return diff.files.some((f) => f.hunks.some((h) => !(h.newLines <= MAX_HUNK_LINES)));
}

/**
 * Whether the expectation's lines fall inside a frozen hunk. Reuses the engine's grounding gate with
 * a synthetic finding so an expectation is accepted by exactly the rule a produced finding must pass.
 */
export function isExpectationGrounded(diff: UnifiedDiff, expectation: EvalExpectation): boolean {
  // The engine's gate walks the range (and a hunk's declared lines) one by one: refuse anything unbounded first.
  if (!boundedExpectation(expectation) || hasOversizedHunk(diff)) return false;
  const probe: Finding = {
    id: 'expectation',
    severity: 'SUGGESTION',
    category: 'style',
    title: 'expectation',
    file: expectation.file,
    start_line: expectation.start_line,
    end_line: expectation.end_line,
    rationale: '',
    confidence: 1,
  };
  return groundFindings([probe], diff).kept.length === 1;
}

export interface DecidedFindingFacts {
  file: string;
  startLine: number;
  endLine: number;
  title: string;
  category: string;
  severity: string;
}

/** Accepted → `must_find`, dismissed → `must_not_flag`; lines and labels copied from the finding. */
export function expectationFromFinding(
  finding: DecidedFindingFacts,
  decision: 'accepted' | 'dismissed',
): EvalExpectation {
  const type: EvalExpectationType = decision === 'accepted' ? 'must_find' : 'must_not_flag';
  return {
    type,
    file: finding.file,
    start_line: finding.startLine,
    end_line: finding.endLine,
    label: { title: finding.title, category: finding.category, severity: finding.severity },
  };
}

/** `<type>-<slug>`: slug is the lowercase-ascii title, dash separated, at most 60 characters. */
export function caseName(type: EvalExpectationType, title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, CASE_NAME_SLUG_MAX)
    .replace(/-+$/, '');
  return `${type}-${slug || 'finding'}`;
}

export interface CaseMetaSources {
  findingId: string;
  reviewId: string;
  runId: string | null;
  repo: string;
  prNumber: number;
  headSha: string;
  prTitle: string;
  prBody: string | null;
}

/** Provenance frozen into `eval_cases.input_meta`. */
export function caseMetaFrom(s: CaseMetaSources): EvalCaseMeta {
  return {
    source_finding_id: s.findingId,
    source_review_id: s.reviewId,
    source_run_id: s.runId,
    repo: s.repo,
    pr_number: s.prNumber,
    head_sha: s.headSha,
    pr_title: s.prTitle,
    pr_body: s.prBody,
  };
}

export type ManualCaseCheck =
  | { ok: true; files: string[] }
  | { ok: false; code: 'diff_unavailable' | 'expectation_not_grounded'; reason: string };

/**
 * Validate a hand-written case (case editor): the diff must parse into at least one file, the expectation
 * must name one of those files with a sane line range, and its lines must fall inside a hunk of the
 * supplied diff (the same grounding rule a produced finding must pass). Paths are compared as strings only.
 */
export function checkManualCase(
  inputDiff: string,
  expectation: EvalExpectationInput,
  parseDiff: (raw: string) => UnifiedDiff,
): ManualCaseCheck {
  if (!inputDiff.trim()) return { ok: false, code: 'diff_unavailable', reason: 'the diff is empty' };
  const diff = parseDiff(inputDiff);
  if (diff.files.length === 0 || diff.files.every((f) => f.hunks.length === 0)) {
    return { ok: false, code: 'diff_unavailable', reason: 'the diff has no files or hunks' };
  }
  if (diff.files.some((f) => CONTROL_CHARS.test(f.path))) {
    return { ok: false, code: 'diff_unavailable', reason: 'a file path contains control characters' };
  }
  if (expectation.end_line < expectation.start_line) {
    return { ok: false, code: 'expectation_not_grounded', reason: 'end_line is before start_line' };
  }
  if (hasOversizedHunk(diff)) {
    return { ok: false, code: 'diff_unavailable', reason: 'a hunk header declares an unreasonable number of lines' };
  }
  if (!boundedExpectation(expectation)) {
    return { ok: false, code: 'expectation_not_grounded', reason: 'the line range is out of bounds' };
  }
  const grounded = isExpectationGrounded(diff, {
    type: expectation.type,
    file: expectation.file,
    start_line: expectation.start_line,
    end_line: expectation.end_line,
  });
  if (!grounded) {
    return {
      ok: false,
      code: 'expectation_not_grounded',
      reason: 'the expectation file and lines are not inside a hunk of the supplied diff',
    };
  }
  return { ok: true, files: diff.files.map((f) => f.path) };
}

/** Expectation stored for a hand-written case; the title (optional) is the only label we know. */
export function expectationFromInput(
  input: EvalExpectationInput,
  previous?: EvalExpectation['label'],
): EvalExpectation {
  const title = input.title?.trim() || previous?.title || '';
  return {
    type: input.type,
    file: input.file,
    start_line: input.start_line,
    end_line: input.end_line,
    label: title || previous ? { title, category: previous?.category ?? '', severity: previous?.severity ?? '' } : null,
  };
}
