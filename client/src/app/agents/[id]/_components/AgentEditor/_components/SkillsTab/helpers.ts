import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** One row of the tab: a workspace skill plus whether it is attached to this agent. */
export interface SkillRow {
  skill: Skill;
  checked: boolean;
}

/** Linked skills first (by link order), then every unlinked workspace skill. */
export function buildRows(skills: Skill[], links: AgentSkillLink[]): SkillRow[] {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const linked = [...links].sort((a, b) => a.order - b.order);
  const seen = new Set<string>();
  const rows: SkillRow[] = [];
  for (const l of linked) {
    const skill = byId.get(l.skill_id);
    if (!skill || seen.has(l.skill_id)) continue;
    seen.add(l.skill_id);
    rows.push({ skill, checked: l.enabled });
  }
  for (const skill of skills) if (!seen.has(skill.id)) rows.push({ skill, checked: false });
  return rows;
}

/** A row is enabled when it will really reach the prompt: checked on this agent AND globally enabled. */
export function isEnabledRow(r: SkillRow): boolean {
  return r.checked && r.skill.enabled;
}

export function countEnabled(rows: SkillRow[]): number {
  return rows.filter(isEnabledRow).length;
}

/** Move `id` one step up/down among the currently visible rows (filter-safe). */
export function moveRow(rows: SkillRow[], visibleIds: string[], id: string, dir: -1 | 1): SkillRow[] {
  const vi = visibleIds.indexOf(id);
  const neighbour = visibleIds[vi + dir];
  if (vi < 0 || neighbour === undefined) return rows;
  return swap(rows, id, neighbour);
}

function swap(rows: SkillRow[], a: string, b: string): SkillRow[] {
  const i = rows.findIndex((r) => r.skill.id === a);
  const j = rows.findIndex((r) => r.skill.id === b);
  if (i < 0 || j < 0) return rows;
  const next = [...rows];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Drop `id` into the slot currently held by `targetId`. */
export function dropRow(rows: SkillRow[], id: string, targetId: string): SkillRow[] {
  if (id === targetId) return rows;
  const from = rows.findIndex((r) => r.skill.id === id);
  const to = rows.findIndex((r) => r.skill.id === targetId);
  if (from < 0 || to < 0) return rows;
  // Only enabled skills take part in ordering: a disabled row is neither dragged nor a drop target.
  if (!isEnabledRow(rows[from]!) || !isEnabledRow(rows[to]!)) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** POST body: checked skills, in list order (index = prompt order). */
export function toPayload(rows: SkillRow[]): { skill_id: string; enabled: boolean }[] {
  return rows.filter((r) => r.checked).map((r) => ({ skill_id: r.skill.id, enabled: true }));
}
