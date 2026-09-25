import type { SmartDiffRole } from "@devdigest/shared";

/** Display order of the role groups. */
export const SMART_ROLE_ORDER: SmartDiffRole[] = ["core", "tests", "wiring", "docs", "boilerplate"];

/** Groups whose whole body starts collapsed (header stays visible). */
export const COLLAPSED_ROLES: SmartDiffRole[] = ["docs", "boilerplate"];

/** role → `prReview.smartDiff.<key>` label. */
export const ROLE_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreLabel",
  tests: "smartDiff.testsLabel",
  wiring: "smartDiff.wiringLabel",
  docs: "smartDiff.docsLabel",
  boilerplate: "smartDiff.boilerplateLabel",
};

/** role → `prReview.smartDiff.<key>` one-line description shown after the label. */
export const ROLE_DESC_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreDesc",
  tests: "smartDiff.testsDesc",
  wiring: "smartDiff.wiringDesc",
  docs: "smartDiff.docsDesc",
  boilerplate: "smartDiff.boilerplateDesc",
};

/** role → header square colour (existing theme tokens only). */
export const ROLE_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  tests: "var(--ok)",
  wiring: "var(--warn)",
  docs: "var(--text-secondary)",
  boilerplate: "var(--stale)",
};
