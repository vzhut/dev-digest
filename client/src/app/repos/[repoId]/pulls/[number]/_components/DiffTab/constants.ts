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
