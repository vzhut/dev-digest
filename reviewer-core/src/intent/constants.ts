/** Caps applied by the intent prompt builder and by post-parse truncation. */
export const MAX_TITLE_CHARS = 300;
export const MAX_DESCRIPTION_CHARS = 4000;
export const MAX_FILES = 300;
export const MAX_HUNK_HEADERS = 200;
export const MAX_HUNK_HEADER_CHARS = 160;
/** Total untrusted text (description + loaded sources) sent to the classifier. */
export const MAX_UNTRUSTED_CHARS = 12_000;
/** Model output caps — enforced by code after parsing, not trusted to the model. */
export const MAX_LIST_ITEMS = 8;
export const MAX_ITEM_CHARS = 160;
export const MAX_SUMMARY_CHARS = 300;
/** Description shorter than this (meaningful chars) forces `low` confidence. */
export const MIN_DESCRIPTION_CHARS = 40;
/**
 * Without a loaded linked source (issue, spec, ticket), a description shorter than this
 * cannot support a scope judgement: confidence is `low`, so no finding is downgraded.
 */
export const SUBSTANTIVE_DESCRIPTION_CHARS = 200;
/** Cap for the whole rendered intent block in the reviewer prompt. */
export const MAX_INTENT_SECTION_CHARS = 3000;
