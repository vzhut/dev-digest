/**
 * Pure project-context rules (no DB, no FS): default search roots, doc type
 * classification, run doc-set resolution and the "used by agents" count.
 */
import type { ContextDocType } from '@devdigest/shared';

export const DEFAULT_CONTEXT_ROOTS: readonly string[] = ['**/{specs,docs,insights}/**/*.md'];

const TYPE_FOLDERS: ReadonlySet<string> = new Set(['specs', 'docs', 'insights']);

/** Stored roots when a non-empty array; NULL / `[]` fall back to the default glob. */
export function effectiveRoots(stored: readonly string[] | null | undefined): string[] {
  return stored && stored.length > 0 ? [...stored] : [...DEFAULT_CONTEXT_ROOTS];
}

/** Nearest ancestor folder named specs / docs / insights, else `other`. */
export function classifyDocType(path: string): ContextDocType {
  const segments = path.split('/');
  for (let i = segments.length - 2; i >= 0; i--) {
    const seg = segments[i]!;
    if (TYPE_FOLDERS.has(seg)) return seg as ContextDocType;
  }
  return 'other';
}

/** Agent paths first, then each skill's paths in order; first occurrence wins. */
export function resolveRunDocSet(
  agentPaths: readonly string[],
  skills: readonly { contextPaths: readonly string[] }[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...agentPaths, ...skills.flatMap((s) => s.contextPaths)]) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

export interface UsedByAgent {
  id: string;
  contextPaths: readonly string[];
}

export interface UsedBySkill {
  id: string;
  enabled: boolean;
  contextPaths: readonly string[];
}

export interface UsedByLink {
  agentId: string;
  skillId: string;
  enabled: boolean;
}

/**
 * Distinct agents per path, attached directly or via a skill whose agent-skill
 * link AND skill are both enabled. Agents count whether or not they are enabled.
 */
export function countUsedByAgents(
  agents: readonly UsedByAgent[],
  skills: readonly UsedBySkill[],
  links: readonly UsedByLink[],
): Map<string, number> {
  const agentIdsByPath = new Map<string, Set<string>>();
  const add = (path: string, agentId: string) => {
    let set = agentIdsByPath.get(path);
    if (!set) agentIdsByPath.set(path, (set = new Set()));
    set.add(agentId);
  };

  for (const a of agents) for (const p of a.contextPaths) add(p, a.id);

  const skillById = new Map(skills.map((s) => [s.id, s]));
  for (const l of links) {
    if (!l.enabled) continue;
    const skill = skillById.get(l.skillId);
    if (!skill?.enabled) continue;
    for (const p of skill.contextPaths) add(p, l.agentId);
  }

  return new Map([...agentIdsByPath].map(([path, ids]) => [path, ids.size]));
}
