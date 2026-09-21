import type { SkillType } from "@devdigest/shared";

export const DRAWER_WIDTH = 560;
export const ACCEPTED_FILES = ".md,.zip";
export const DEFAULT_SKILL_TYPE: SkillType = "custom";
export const TYPE_OPTIONS = ["rubric", "convention", "security", "custom"] as const;
