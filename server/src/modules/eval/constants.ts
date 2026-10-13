/** Leading path prefixes stripped before a produced finding's file is compared to an expectation. */
export const EVAL_PATH_PREFIXES = ['a/', 'b/', './'] as const;

/** A latest-vs-previous metric drop of at least this much is flagged as a regression (AC-40). */
export const REGRESSION_DELTA = 0.05;

/**
 * Above this many changed lines (additions + deletions) a frozen single-file diff keeps only the
 * hunks intersecting the finding plus one neighbour on each side (spec OQ-3).
 */
export const FROZEN_DIFF_MAX_CHANGED_LINES = 400;

/** Longest slug of a finding title in a generated case name. */
export const CASE_NAME_SLUG_MAX = 60;

/** One case's agent call is abandoned after this long, so a hung provider cannot pin a run in `running`. */
export const CASE_TIMEOUT_MS = 120_000;

/** Longest PR title placed on the task line of an eval prompt. */
export const TASK_TITLE_MAX_CHARS = 200;

/** Runs returned by the per-agent history and dashboard. */
export const AGENT_RUNS_LIMIT = 50;
/** Points on a sparkline / trend chart (newest runs, oldest first). */
export const TREND_POINTS = 20;
/** Rows in the dashboard's recent-runs table. */
export const RECENT_RUNS_LIMIT = 20;
/** `error_reason` of a run whose process died while it was running. */
export const ORPHANED_RUN_REASON = 'server_restarted';

/** Most eval cases one agent may own: every case is one paid LLM call per run. */
export const MAX_CASES_PER_AGENT = 200;

/** Stable, user-facing reasons stored on an errored case; the detail goes to the server log only. */
export const CASE_ERROR_REASON = {
  provider: 'provider error',
  providerUnavailable: 'provider unavailable',
  invalidOutput: 'invalid structured output',
  outOfCredits: 'provider out of credits',
  keyRejected: 'provider key rejected',
  rateLimited: 'provider rate limited',
  runFailed: 'run failed',
} as const;

/** Defensive bounds for hand-written cases: grounding walks a range / hunk line by line, so nothing unbounded may reach it. */
export const MAX_EXPECTATION_LINE = 1_000_000;
export const MAX_EXPECTATION_SPAN = 100_000;
export const MAX_HUNK_LINES = 100_000;
/** Total new-side lines ALL hunks of one diff may declare: a header-only hunk costs the grounding gate its declared length. */
export const MAX_DIFF_DECLARED_LINES = 100_000;

/**
 * Output-token ceiling of one eval review call. Without a `max_tokens` OpenRouter reserves credit for the model's
 * FULL output window (65,536 for claude-sonnet-4.6) and answers 402 when the balance cannot cover that reservation,
 * even though a review is a few thousand tokens. A findings list (a handful of findings with rationales) is well
 * under 16k tokens; a response that did hit the cap would be truncated JSON and fail as "invalid structured output".
 */
export const EVAL_MAX_OUTPUT_TOKENS = 16_384;
