import type { PromptSkill } from '@devdigest/reviewer-core';

/**
 * Which skills go into a run's prompt and how they reach the engine. Shared by the PR review
 * executor and the eval executor so both gate and order skills identically (pure, no I/O).
 */

/** One agent_skills ⋈ skills row, before gating. */
export interface AgentSkillLinkRow {
  order: number;
  linkEnabled: boolean;
  skill: { id: string; name: string; body: string; source: string; enabled: boolean; contextPaths?: string[] };
}

export type ResolvedSkill = PromptSkill & { id: string; contextPaths: string[] };

/** Sources whose body a workspace member authored/reviewed (D4); others are wrapped <untrusted>. */
const TRUSTED_SKILL_SOURCES = new Set(['manual', 'extracted']);

/**
 * Skills that go into a run's prompt: link enabled AND skill enabled, ordered by
 * agent_skills.order ascending, mapped to PromptSkill (+ id for run_skills).
 */
export function resolveRunSkills(links: AgentSkillLinkRow[]): ResolvedSkill[] {
  return links
    .filter((l) => l.linkEnabled && l.skill.enabled)
    .sort((a, b) => a.order - b.order)
    .map((l) => ({
      id: l.skill.id,
      name: l.skill.name,
      body: l.skill.body,
      trusted: TRUSTED_SKILL_SOURCES.has(l.skill.source),
      contextPaths: l.skill.contextPaths ?? [],
    }));
}

/** Strip the id and context paths so only the PromptSkill shape reaches reviewer-core. */
export function toPromptSkills(skills: ResolvedSkill[]): PromptSkill[] {
  return skills.map(({ name, body, trusted }) => ({ name, body, trusted }));
}
