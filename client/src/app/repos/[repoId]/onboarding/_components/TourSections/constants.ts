/** Section ids double as URL fragments (`#first-tasks`) and nav-list keys. */
export const SECTION_IDS = [
  "architecture",
  "critical-paths",
  "run-locally",
  "reading-path",
  "first-tasks",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];
