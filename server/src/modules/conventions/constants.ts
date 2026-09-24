/**
 * Tuning constants for the Conventions Extractor. Kept here (not inline in
 * helpers.ts) so the numbers are reviewable on their own, same treatment as
 * the reviewer prompt constants (AGENTS.md "reviewer prompts").
 */

// ---- Sampling (§4.2) ----

/** Config filenames looked for at the repo root and one level down. Globs are
 * matched against the file's basename with a leading-prefix rule for the
 * starred entries (e.g. `.eslintrc*` matches `.eslintrc.json`). */
export const CONFIG_FILE_PATTERNS = [
  '.eslintrc',
  'eslint.config',
  'tsconfig',
  '.prettierrc',
  '.editorconfig',
  'biome.json',
] as const;

export const MAX_CONFIG_FILES = 6;
export const MAX_CONFIG_BYTES = 4 * 1024;
export const MAX_CONFIG_DEPTH = 1; // repo root + one level down

export const MAX_SOURCE_FILES = 12;
export const MAX_SOURCE_LINES = 250;
export const MAX_SOURCE_BYTES = 12 * 1024;

// ---- Model call (§4.3) ----

export const MAX_MODEL_CANDIDATES = 25;

// ---- Evidence verification (§4.4) ----

/** A cited span longer than this is dropped as `bad_range` — a "convention" is
 * one idea, not a whole function. */
export const MAX_EVIDENCE_SPAN_LINES = 30;

/** How far outside the model's cited range we still search for its quote
 * before giving up as `quote_mismatch`. A hit outside the exact range repairs
 * the range to that one line instead of dropping the candidate. */
export const QUOTE_SEARCH_MARGIN_LINES = 3;

export const MAX_RULE_LENGTH = 200;
export const MIN_CONFIDENCE = 0.5;
export const MAX_SNIPPET_LINES = 12;
export const MAX_KEPT_CANDIDATES = 20;

// ---- Create-skill (§4.6, C14) ----

/** The default name every first extracted skill in a fresh DB gets (C14). A
 * clash offers rename/update in the client; this constant is only the
 * suggestion. */
export const DEFAULT_SKILL_NAME = 'repo-conventions';

// ---- Measured support (§10 improvement #1) ----

/** Below this many COMBINED occurrences (support + violation) across the
 * whole clone, the measurement is too thin to trust — the candidate keeps
 * the model's own confidence instead of being scored or dropped on it. */
export const MIN_MEASURED_TOTAL = 2;

/** A candidate that clears MIN_MEASURED_TOTAL but whose measured ratio
 * (support / (support + violation)) falls below this is dropped as
 * `weak_support` — the model's claimed convention isn't actually followed
 * consistently in this repo. */
export const MIN_MEASURED_SUPPORT = 0.7;

/** Drop reasons, in the order §4.4 applies them — first failure wins.
 * `weak_support` is a separate, later pass (§10 #1) — it only ever applies
 * to a candidate that already passed all six of the above. */
export const DROP_REASONS = [
  'no_file',
  'bad_range',
  'quote_mismatch',
  'bad_rule',
  'low_confidence',
  'duplicate',
  'weak_support',
] as const;
