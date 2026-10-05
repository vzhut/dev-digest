import type { BlastRadius, Risk, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../_shared/smart-diff-role.js';
import { PROMPT_TOKEN_BUDGET } from './constants.js';
import type { BriefLlmOutput } from './output-schema.js';

/** Numeric new-side line range of one hunk (1-based, inclusive). */
export interface HunkRange {
  start: number;
  end: number;
}

/** Per-file facts for the prompt: numbers and a role, never patch text (AC-10). */
export interface DiffStat {
  path: string;
  role: SmartDiffRole;
  additions: number;
  deletions: number;
  ranges: HunkRange[];
}

export interface DiffStatInput {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

// Only the numbers are captured; whatever follows the closing `@@` (the hunk
// header context, which is attacker-controlled code text) is never read.
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** New-side ranges of every hunk in a unified-diff patch. Pure-deletion hunks (`+c,0`) have no new lines and are skipped. */
export function hunkRanges(patch: string | null | undefined): HunkRange[] {
  if (!patch) return [];
  const out: HunkRange[] = [];
  for (const line of patch.split('\n')) {
    const m = HUNK_HEADER.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const len = m[2] === undefined ? 1 : Number(m[2]);
    if (len > 0 && start >= 1) out.push({ start, end: start + len - 1 });
  }
  return out;
}

export function toDiffStats(files: readonly DiffStatInput[]): DiffStat[] {
  return files.map((f) => ({
    path: f.path,
    role: classifyFile(f.path),
    additions: f.additions,
    deletions: f.deletions,
    ranges: hunkRanges(f.patch),
  }));
}

/** Trim a leading `./` or `/` (repeatedly) so model and GitHub paths compare exactly (AC-18). */
export function normalizeRepoPath(p: string): string {
  return p.trim().replace(/^(?:\.\/|\/)+/, '');
}

/** Split `path`, `path:line` or `path:start-end` into its path and the optional suffix. */
export function parseFileRef(ref: string): { path: string; suffix: string } {
  const m = /^(.*?)(:\d+(?:-\d+)?)$/.exec(ref.trim());
  return m ? { path: normalizeRepoPath(m[1]!), suffix: m[2]! } : { path: normalizeRepoPath(ref), suffix: '' };
}

/** De-duplicated caller files of a blast map, in map order. */
export function callerFiles(blast: BlastRadius | null | undefined): string[] {
  if (!blast) return [];
  const seen = new Set<string>();
  for (const d of blast.downstream) for (const c of d.callers) seen.add(normalizeRepoPath(c.file));
  return [...seen];
}

/** Every file a blast map names: declaring files and caller files (the grounding set, AC-18). */
export function blastFiles(blast: BlastRadius | null | undefined): string[] {
  if (!blast) return [];
  const seen = new Set<string>();
  for (const c of blast.changed_symbols) seen.add(normalizeRepoPath(c.file));
  for (const d of blast.downstream) if (d.file) seen.add(normalizeRepoPath(d.file));
  for (const f of callerFiles(blast)) seen.add(f);
  return [...seen];
}

export interface GroundedBrief {
  risks: Risk[];
  review_focus: BriefLlmOutput['review_focus'];
  /** Whole items dropped + invalid refs removed from kept risks (D1). */
  dropped: number;
}

/**
 * Drop everything the model cites that is not in `allowed` (PR files + blast
 * files). A risk with no valid ref and a focus item with an invalid file are
 * dropped whole; invalid refs of a kept risk are removed. Paths are normalised.
 */
export function groundBrief(output: BriefLlmOutput, allowed: Iterable<string>): GroundedBrief {
  const ok = new Set<string>();
  for (const p of allowed) ok.add(normalizeRepoPath(p));
  let dropped = 0;

  const risks: Risk[] = [];
  for (const r of output.risks) {
    const refs: string[] = [];
    for (const raw of r.file_refs) {
      const { path, suffix } = parseFileRef(raw);
      if (ok.has(path)) refs.push(`${path}${suffix}`);
    }
    if (refs.length === 0) {
      dropped += 1; // the whole risk counts once, not once per ref
      continue;
    }
    dropped += r.file_refs.length - refs.length;
    risks.push({ ...r, file_refs: refs });
  }

  const review_focus: GroundedBrief['review_focus'] = [];
  for (const f of output.review_focus) {
    const file = normalizeRepoPath(f.file);
    if (ok.has(file)) review_focus.push({ ...f, file });
    else dropped += 1;
  }
  return { risks, review_focus, dropped };
}

/** AC-33: stale when the stored head SHA differs from the PR's current one. */
export function isStale(briefHeadSha: string | null | undefined, pullHeadSha: string): boolean {
  return briefHeadSha !== pullHeadSha;
}

export interface BriefLogFields {
  prId: string;
  headSha: string;
  ok: boolean;
  llmCalls: 0 | 1;
  inputTokens: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  model: string;
  durationMs: number;
  dropped: number;
  missing: readonly string[];
}

/** AC-35: the one line written when a generation finishes. */
export function formatBriefLog(f: BriefLogFields): string {
  const cost = f.costUsd === null ? 'unknown' : `$${f.costUsd.toFixed(4)}`;
  return (
    `brief: generated pr=${f.prId} head=${f.headSha.slice(0, 7)} ok=${f.ok} llm_calls=${f.llmCalls} ` +
    `input_tokens=${f.inputTokens}/${PROMPT_TOKEN_BUDGET} tokens=${f.tokensIn}/${f.tokensOut} cost=${cost} ` +
    `model=${f.model} duration_ms=${f.durationMs} dropped=${f.dropped} ` +
    `missing=${f.missing.length > 0 ? f.missing.join(',') : 'none'}`
  );
}
