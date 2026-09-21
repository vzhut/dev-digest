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

/** True when any config field differs from the saved skill. */
export function isDirty(form: SkillForm, skill: Skill): boolean {
  const saved = formFromSkill(skill);
  return (Object.keys(saved) as (keyof SkillForm)[]).some((k) => form[k] !== saved[k]);
}

/** Save needs a non-blank name; the version message is optional and the server validates the rest. */
export function canSave(form: SkillForm): boolean {
  return form.name.trim().length > 0;
}
