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
/** Newest runs scanned to build the workspace dashboard cards. */
export const DASHBOARD_RUN_WINDOW = 200;
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
  runFailed: 'run failed',
} as const;
