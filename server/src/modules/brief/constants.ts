/** PR brief generation constants (spec AC-13, AC-16, AC-35). */

/** Whole assembled prompt (system + user), counted with cl100k_base. */
export const PROMPT_TOKEN_BUDGET = 12_000;

/** Per-section caps, measured on the WRAPPED text (untrusted tags and labels included). */
export const TITLE_DESCRIPTION_CAP = 1_500;
export const ISSUE_CAP = 1_200;
/** A budget allowance only: the Intent is never cut (D4). */
export const INTENT_CAP = 600;
export const BLAST_CAP = 1_400;
export const DIFF_STATS_CAP = 2_300;
export const SPECS_CAP = 4_000;

export const MAX_CALLER_FILES = 60;
export const MAX_DIFF_FILES = 200;

/** What is left for the system message once every cap is full. */
export const SYSTEM_MESSAGE_BUDGET =
  PROMPT_TOKEN_BUDGET -
  (TITLE_DESCRIPTION_CAP + ISSUE_CAP + INTENT_CAP + BLAST_CAP + DIFF_STATS_CAP + SPECS_CAP);

/** Chars kept BEFORE tokenizing (js-tiktoken is quadratic on long unbroken runs). */
export const TEXT_CHAR_PRECAP = 12_000;
export const SPECS_CHAR_PRECAP = 16_000;

/** Numeric new-side hunk ranges listed per file. */
export const MAX_RANGES_PER_FILE = 12;

/** Per-line cap for path-like strings in the prompt. */
export const MAX_PROMPT_LINE_CHARS = 300;

/** Per-request timeout of the one structured LLM call, plus the hard backstop on top of it. */
export const LLM_TIMEOUT_MS = 90_000;
export const BACKSTOP_GRACE_MS = 5_000;

export const RISK_BRIEF_CALL_NAME = 'risk_brief';
export const RISK_BRIEF_SCHEMA_NAME = 'RiskBrief';
