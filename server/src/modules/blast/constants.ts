/** Structured-log event name for a blast-radius read (spec P2.1). */
export const BLAST_LOG_EVENT = 'blast.read';

/** Log messages: which source served the map. */
export const BLAST_LOG_MSG_INDEX = 'blast: read repo-intel index (no re-parse, no LLM)';
export const BLAST_LOG_MSG_FALLBACK = 'blast: index unusable — ripgrep fallback (degraded)';

/**
 * Prior PRs (Design "Prior PRs", OD5). Caps bound GitHub calls per cache miss to
 * `HISTORY_MAX_PATHS + HISTORY_MAX_COMMITS` (<= 40).
 */
export const HISTORY_MAX_PATHS = 10;
export const HISTORY_COMMITS_PER_PATH = 10;
export const HISTORY_MAX_COMMITS = 30;
export const HISTORY_MAX_ITEMS = 5;

/** In-process TTL cache, keyed `repoId:headSha` — no DB table. */
export const HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;
export const HISTORY_CACHE_MAX_ENTRIES = 200;

/** Structured-log event name for a prior-PRs read. */
export const HISTORY_LOG_EVENT = 'blast.history.read';
