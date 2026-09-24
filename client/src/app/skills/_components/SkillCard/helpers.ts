import type { Skill } from "@devdigest/shared";

/** Skills from outside the workspace are stored as untrusted data and need vetting. */
export function isUntrusted(skill: Pick<Skill, "source">): boolean {
  return skill.source === "imported_url" || skill.source === "community";
}

export interface TypeTint {
  fg: string;
  bg: string;
}

/** Colour of the icon tile + type badge by skill type. */
export function typeTint(type: Skill["type"]): TypeTint {
  switch (type) {
    case "rubric":
      return { fg: "var(--accent-text, var(--accent))", bg: "var(--accent-bg)" };
    case "convention":
      return { fg: "var(--ok)", bg: "var(--ok-bg)" };
    case "security":
      return { fg: "var(--crit)", bg: "var(--crit-bg)" };
    default:
      return { fg: "var(--text-secondary)", bg: "var(--bg-hover)" };
  }
}

/** Icon shown next to the source label. */
export function sourceIcon(source: Skill["source"]): "Edit" | "Zap" | "Globe" | "Link" {
  switch (source) {
    case "manual":
      return "Edit";
    case "community":
      return "Globe";
    case "imported_url":
      return "Link";
    default:
      return "Zap";
  }
}
