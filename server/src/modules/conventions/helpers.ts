import { createHash } from 'node:crypto';
import type { ConventionCategory } from '@devdigest/shared';
import {
  CONFIG_FILE_PATTERNS,
  MAX_CONFIG_BYTES,
  MAX_CONFIG_DEPTH,
  MAX_CONFIG_FILES,
  MAX_EVIDENCE_SPAN_LINES,
  MAX_KEPT_CANDIDATES,
  MAX_RULE_LENGTH,
  MAX_SNIPPET_LINES,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_LINES,
  MIN_CONFIDENCE,
  QUOTE_SEARCH_MARGIN_LINES,
} from './constants.js';

/**
 * Pure core of the Conventions Extractor — no DB, no GitClient, no LLM call.
 * The service (slice 3) wires these against real IO. Everything here is a
 * plain function on plain data so it is trivial to unit test (§9).
 */

// ============================================================ Sampling (§4.2)

/**
 * Which of the repo's file paths are config files worth sampling: match one
 * of `CONFIG_FILE_PATTERNS` by basename prefix, at the repo root or one level
 * down, capped at `MAX_CONFIG_FILES`. Order follows the input list (callers
 * pass an already-ranked or directory-ordered listing).
 */
export function selectConfigFiles(paths: string[]): string[] {
  const out: string[] = [];
  for (const path of paths) {
    if (out.length >= MAX_CONFIG_FILES) break;
    const depth = path.split('/').length - 1;
    if (depth > MAX_CONFIG_DEPTH) continue;
    const basename = path.slice(path.lastIndexOf('/') + 1);
    if (CONFIG_FILE_PATTERNS.some((p) => basename.startsWith(p))) out.push(path);
  }
  return out;
}

/**
 * Line-numbered head of a file, capped by lines and bytes (§4.2 step 3) —
 * "head of file" because imports/declarations carry most conventions, and
 * numbering is what makes the model's `line_start` checkable by the verifier.
 */
export function numberAndCapLines(
  content: string,
  maxLines: number = MAX_SOURCE_LINES,
  maxBytes: number = MAX_SOURCE_BYTES,
): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let bytes = 0;
  for (let i = 0; i < lines.length && i < maxLines; i++) {
    const numbered = `${i + 1}: ${lines[i]}`;
    const size = Buffer.byteLength(numbered, 'utf8') + 1;
    if (bytes + size > maxBytes) break;
    out.push(numbered);
    bytes += size;
  }
  return out.join('\n');
}

// ======================================================= Evidence types

export interface ModelCandidate {
  category: ConventionCategory;
  rule: string;
  evidence: { path: string; line_start: number; line_end: number; quote: string };
  confidence: number;
}

/** One file's content, split into 1-indexed-accessible lines (`lines[0]` is line 1). */
export interface FileLines {
  path: string;
  lines: string[];
}

export type DropReason =
  | 'no_file'
  | 'bad_range'
  | 'quote_mismatch'
  | 'bad_rule'
  | 'low_confidence'
  | 'duplicate';

export interface VerifiedCandidate {
  category: ConventionCategory;
  rule: string;
  ruleOriginal: string;
  evidencePath: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  /** Read from the file by this function, never the model's `quote`/text. */
  evidenceSnippet: string;
  confidence: number;
  fingerprint: string;
}

export type VerifyResult = { ok: true; candidate: VerifiedCandidate } | { ok: false; reason: DropReason };

const normaliseWhitespace = (s: string): string => s.trim().replace(/\s+/g, ' ');

/** Rejects `../` traversal and absolute paths — the only two ways a model-cited
 * path could point outside the clone. */
function isSafeRelativePath(path: string): boolean {
  if (path.startsWith('/') || path.startsWith('~')) return false;
  const segments = path.split('/');
  return !segments.includes('..') && !segments.includes('.');
}

/**
 * §4.4 — applies the six checks in the documented order, first failure wins.
 * `files` is keyed by the exact path the candidate cites; the caller has
 * already read every file the model could plausibly reference.
 * `seenFingerprints` accumulates across a single scan's candidates so a later
 * duplicate in the same batch is dropped (mutated on success, same as a Set
 * the caller iterates candidates against).
 */
export function verifyCandidate(
  candidate: ModelCandidate,
  files: ReadonlyMap<string, FileLines>,
  seenFingerprints: ReadonlySet<string>,
): VerifyResult {
  const { path, line_start, line_end, quote } = candidate.evidence;

  if (!isSafeRelativePath(path)) return { ok: false, reason: 'no_file' };
  const file = files.get(path);
  if (!file) return { ok: false, reason: 'no_file' };

  const length = file.lines.length;
  if (
    !Number.isInteger(line_start) ||
    !Number.isInteger(line_end) ||
    line_start < 1 ||
    line_end < line_start ||
    line_end > length ||
    line_end - line_start + 1 > MAX_EVIDENCE_SPAN_LINES
  ) {
    return { ok: false, reason: 'bad_range' };
  }

  const wantedQuote = normaliseWhitespace(quote);
  const searchStart = Math.max(1, line_start - QUOTE_SEARCH_MARGIN_LINES);
  const searchEnd = Math.min(length, line_end + QUOTE_SEARCH_MARGIN_LINES);
  let matchedLine: number | null = null;
  for (let ln = searchStart; ln <= searchEnd; ln++) {
    if (normaliseWhitespace(file.lines[ln - 1] ?? '').includes(wantedQuote)) {
      matchedLine = ln;
      if (ln >= line_start && ln <= line_end) break; // exact-range hit wins outright
    }
  }
  if (matchedLine === null) return { ok: false, reason: 'quote_mismatch' };

  // Repair: a hit outside the cited range collapses the range to that one line.
  const finalStart = matchedLine >= line_start && matchedLine <= line_end ? line_start : matchedLine;
  const finalEnd = matchedLine >= line_start && matchedLine <= line_end ? line_end : matchedLine;

  const rule = candidate.rule.trim();
  if (rule.length === 0 || rule.length > MAX_RULE_LENGTH) return { ok: false, reason: 'bad_rule' };

  if (candidate.confidence < MIN_CONFIDENCE) return { ok: false, reason: 'low_confidence' };

  const fingerprint = computeFingerprint(rule);
  if (seenFingerprints.has(fingerprint)) return { ok: false, reason: 'duplicate' };

  const snippetLines = file.lines.slice(finalStart - 1, Math.min(finalEnd, finalStart - 1 + MAX_SNIPPET_LINES));

  return {
    ok: true,
    candidate: {
      category: candidate.category,
      rule,
      ruleOriginal: rule,
      evidencePath: path,
      evidenceLineStart: finalStart,
      evidenceLineEnd: finalStart + snippetLines.length - 1,
      evidenceSnippet: snippetLines.join('\n'),
      confidence: candidate.confidence,
      fingerprint,
    },
  };
}

/** Normalised-rule hash (§3 `fingerprint`) — stable across re-scans of the
 * same repo so a decided row can be matched against a freshly extracted one. */
export function computeFingerprint(rule: string): string {
  const normalised = rule.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return createHash('sha1').update(normalised).digest('hex');
}

/** Sorted by confidence desc, capped at `MAX_KEPT_CANDIDATES` (§4.4 tail). */
export function rankAndCapCandidates(candidates: VerifiedCandidate[]): VerifiedCandidate[] {
  return [...candidates].sort((a, b) => b.confidence - a.confidence).slice(0, MAX_KEPT_CANDIDATES);
}

/**
 * §4.5 re-scan semantics: a fresh candidate whose fingerprint matches a row
 * the user already decided (accepted or rejected) must not resurface as a
 * new pending candidate.
 */
export function filterAlreadyDecided(
  candidates: VerifiedCandidate[],
  decidedFingerprints: ReadonlySet<string>,
): VerifiedCandidate[] {
  return candidates.filter((c) => !decidedFingerprints.has(c.fingerprint));
}

// ============================================================ Evidence URL (C3)

/** `https://github.com/{owner}/{repo}/blob/{sha}/{path}#L{a}-L{b}` — pinned to
 * the clone's HEAD sha at scan time, never the current HEAD. */
export function buildEvidenceUrl(
  owner: string,
  repo: string,
  sha: string,
  path: string,
  lineStart: number,
  lineEnd: number,
): string {
  return `https://github.com/${owner}/${repo}/blob/${sha}/${path}#L${lineStart}-L${lineEnd}`;
}

// ============================================================ Composer (§4.6)

/** kebab-case slug, deduplicated against `taken` (the caller's running set) by
 * appending `-2`, `-3`, … on a collision. */
export function slugify(text: string, taken: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'rule';
  let slug = base;
  let n = 2;
  while (taken.has(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  taken.add(slug);
  return slug;
}

export interface AcceptedConvention {
  rule: string;
  evidencePath: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  evidenceSnippet: string;
  confidence: number;
}

export interface ComposedSkill {
  body: string;
  description: string;
  /** Unique evidence paths across the accepted rows. */
  evidenceFiles: string[];
}

/**
 * Pure composer: accepted rows + repo name → skill body. `rejected`/`pending`
 * rows must never reach this function — the caller filters by `status`
 * before calling it. Rows are rendered highest-confidence first.
 */
export function composeSkillBody(repoName: string, accepted: AcceptedConvention[]): ComposedSkill {
  const ordered = [...accepted].sort((a, b) => b.confidence - a.confidence);
  const taken = new Set<string>();
  const sections = ordered.map((row) => {
    const slug = slugify(row.rule, taken);
    const location =
      row.evidenceLineStart === row.evidenceLineEnd
        ? `${row.evidencePath}:${row.evidenceLineStart}`
        : `${row.evidencePath}:${row.evidenceLineStart}-${row.evidenceLineEnd}`;
    return `## ${slug}\n${row.rule}\n\nDetected in \`${location}\`:\n\`\`\`\n${row.evidenceSnippet}\n\`\`\``;
  });

  const header = `# repo-conventions\n\nHouse conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  const body = sections.length > 0 ? `${header}\n\n${sections.join('\n\n')}` : header;

  return {
    body,
    description: `${accepted.length} house conventions extracted from ${repoName}`,
    evidenceFiles: [...new Set(accepted.map((r) => r.evidencePath))],
  };
}
