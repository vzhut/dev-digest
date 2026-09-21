import type { Skill, SkillType } from "@devdigest/shared";

export interface SkillForm {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
}

export function formFromSkill(skill: Skill): SkillForm {
  return {
    name: skill.name,
    description: skill.description,
    type: skill.type,
    body: skill.body,
    enabled: skill.enabled,
  };
}

/** Save needs a non-blank name; anything else is server-validated. */
export function canSave(form: SkillForm): boolean {
  return form.name.trim().length > 0;
}
