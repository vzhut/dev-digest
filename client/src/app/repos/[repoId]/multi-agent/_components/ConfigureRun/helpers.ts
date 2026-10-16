/* Pure selection helper for the Configure run form (checked ids are stored). */
import type { Agent } from "@devdigest/shared";

/** Checked enabled agents, in list order (an agent disabled since it was checked drops out). */
export function checkedIds(enabled: Agent[], checked: ReadonlySet<string>): string[] {
  return enabled.filter((a) => checked.has(a.id)).map((a) => a.id);
}
