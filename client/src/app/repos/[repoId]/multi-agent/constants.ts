/** Route-level constants for /repos/:repoId/multi-agent. */

/** Results view modes (the switch lives in the page header, the views in MultiAgentResults). */
export const MODES = ["columns", "tabs"] as const;
export type Mode = (typeof MODES)[number];
