import type { CiPostAs, CiTrigger } from "@devdigest/shared";

/** Wizard steps in order; labels live under `ci.exportWizard.steps`. */
export const WIZARD_STEPS = ["target", "preview", "configure", "install"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Pull-request events the workflow can run on, in the order the chips are shown. */
export const TRIGGER_VALUES: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];
export const DEFAULT_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize"];

export const POST_AS_VALUES: readonly CiPostAs[] = ["github_review", "pr_comment", "none"];
export const DEFAULT_POST_AS: CiPostAs = "github_review";
/** `ci.exportWizard.postAs.*` key of each posting mode. */
export const POST_AS_LABEL_KEY: Record<CiPostAs, "githubReview" | "prComment" | "none"> = {
  github_review: "githubReview",
  pr_comment: "prComment",
  none: "none",
};

/** Secret the workflow needs, and the one Actions provides itself. */
export const SECRET_KEY = "OPENROUTER_API_KEY";
export const TOKEN_KEY = "GITHUB_TOKEN";

/** Server error codes with their own message under `ci.exportWizard.errors`. */
export const KNOWN_ERROR_CODES = [
  "no_repository",
  "repo_not_accessible",
  "token_missing",
  "token_permission_missing",
  "agent_not_exportable",
  "runner_bundle_missing",
  "workflow_invalid",
  "github_unavailable",
] as const;
export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];

export type InstallMethod = "pr" | "zip";

/** The generated workflow lives under this folder; it is the only file the user may edit. */
export const WORKFLOW_DIR = ".github/workflows/";
