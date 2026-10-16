/* Pure selection helper for the multi-agent picker. The picker stores the UNCHECKED ids so
   "all enabled agents checked" is the default without an effect that seeds state. */
import type { Agent } from "@devdigest/shared";

/** Ids of the enabled agents that are still checked, in list order. */
export function checkedIds(enabled: Agent[], unchecked: ReadonlySet<string>): string[] {
  return enabled.filter((a) => !unchecked.has(a.id)).map((a) => a.id);
}
