import type { Skill } from "@devdigest/shared";

/** Skills from outside the workspace are stored as untrusted data and need vetting. */
export function isUntrusted(skill: Pick<Skill, "source">): boolean {
  return skill.source === "imported_url" || skill.source === "community";
}
