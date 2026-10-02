/** Onboarding Tour generation constants (spec AC-15, AC-16, AC-32). */

/** Per-request timeout of the one structured LLM call. */
export const LLM_TIMEOUT_MS = 90_000;

/** Whole assembled prompt (system + user) must stay within this many tokens. */
export const PROMPT_TOKEN_BUDGET = 16_000;

/** README excerpt cap, in tokens. */
export const README_EXCERPT_TOKENS = 1_500;

/** Characters kept from the README BEFORE tokenizing (js-tiktoken is quadratic on long runs). */
export const README_CHAR_PRECAP = 12_000;

/** First tasks the model is asked for / the merge keeps. */
export const FIRST_TASKS_MIN = 3;
export const FIRST_TASKS_MAX = 5;

/** Max characters of any single model-written text attached to a deterministic item. */
export const MAX_NOTE_CHARS = 400;
export const MAX_TASK_TITLE_CHARS = 140;

/** Caps on the model-written architecture text and diagram (persisted and served on every GET). */
export const MAX_SUMMARY_CHARS = 6_000;
export const MAX_DIAGRAM_CHARS = 3_000;

/** Output-token ceiling for the one structured call. */
export const LLM_MAX_OUTPUT_TOKENS = 6_000;

/** Per-line cap for repo-derived lines in the prompt (a path/command can be attacker-long). */
export const MAX_PROMPT_LINE_CHARS = 400;

/** Max length of the secret-free failure detail stored on a skeleton / last attempt. */
export const MAX_DETAIL_CHARS = 200;

export const ONBOARDING_SCHEMA_NAME = 'OnboardingTour';
export const ONBOARDING_CALL_NAME = 'onboarding';
