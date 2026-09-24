/**
 * Intent layer — caps for what the resolver reads and what the classifier is
 * sent (spec `specs/intent-layer.md`, "Data sources"). The prompt builder and
 * post-parse truncation in reviewer-core enforce their own copies of the
 * prompt-side caps; these are the server-side (fetch/read) limits.
 */

/** Description shorter than this (meaningful chars) forces `low` confidence. */
export const MIN_DESCRIPTION_CHARS = 40;

export const MAX_TITLE_CHARS = 300;
export const MAX_DESCRIPTION_CHARS = 4000;
export const MAX_FILES = 300;
export const MAX_HUNK_HEADERS = 200;
export const MAX_HUNK_HEADER_CHARS = 160;

/** Max linked references followed per kind; overflow is recorded as `blocked`. */
export const MAX_ISSUE_REFS = 3;
export const MAX_FILE_REFS = 3;
export const MAX_TICKET_REFS = 2;
/** Max blocked/unsupported refs listed (keeps missing_context bounded). */
export const MAX_BLOCKED_REFS = 5;

export const MAX_ISSUE_CHARS = 3000;
export const MAX_FILE_CHARS = 4000;
export const MAX_TICKET_CHARS = 3000;

/**
 * Only this much of the PR text is scanned for references. Bounds regex work on
 * an attacker-controlled body (ReDoS) regardless of how long the description is.
 */
export const MAX_SCAN_CHARS = 20_000;
export const MAX_URL_CHARS = 300;
export const MAX_REPO_PATH_CHARS = 200;

/** Repo files must be plain text docs. */
export const REPO_FILE_EXTENSIONS = ['.md', '.txt'] as const;

/**
 * A hung classifier call is abandoned after this (OpenRouter ignores timeoutMs).
 * 90 s, not 45: live deepseek-v4-flash calls took 10–26 s and one exceeded 45 s (server/INSIGHTS.md).
 */
export const CLASSIFIER_TIMEOUT_MS = 90_000;
/** Per-source read timeout (GitHub issue / ticket / repo file). */
export const SOURCE_TIMEOUT_MS = 10_000;

/** Longest error/log fragment kept after redaction. */
export const MAX_LOG_ERROR_CHARS = 300;
