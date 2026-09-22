export const SKELETON_CARDS = 3;

/** Order + label key for each drop reason in the scan quality line (§5,
 * "kept X of Y · Z dropped (…)"). Order follows the verifier's own check
 * order (server §4.4), not frequency, so the line reads consistently. */
export const DROP_REASON_KEYS = [
  "no_file",
  "bad_range",
  "quote_mismatch",
  "bad_rule",
  "low_confidence",
  "duplicate",
] as const;
