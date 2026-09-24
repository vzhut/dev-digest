import type { IntentConfidence, IntentSourceKind } from "@devdigest/shared";

/** Badge colours per confidence level (design tokens). */
export const CONFIDENCE_TONE: Record<IntentConfidence, { color: string; bg: string }> = {
  high: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { color: "var(--crit)", bg: "var(--crit-bg)" },
};

/** Inputs that have a fixed label; the others (issue, spec file, ticket) show their own ref. */
export const FIXED_SOURCE_KINDS: ReadonlySet<IntentSourceKind> = new Set([
  "pr_title",
  "pr_description",
  "file_list",
  "hunk_headers",
]);
