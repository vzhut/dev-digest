/* SkillCard — name, directive description, type / source / vetting badges, version, agent count, enabled toggle. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { isUntrusted, sourceIcon, typeTint } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const tint = typeTint(skill.type);
  const SrcIcon = Icon[sourceIcon(skill.source)];
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox(tint)}>
          <Icon.Sparkles size={15} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()} aria-label={t("card.enabledToggle")}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge color={tint.fg} bg={tint.bg}>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <span style={s.source}>
          <SrcIcon size={12} />
          {t(`listItem.source.${skill.source}`)}
        </span>
        <span style={s.stat} title={t("card.version", { version: skill.version })}>
          {t("card.version", { version: skill.version })}
        </span>
        <span style={s.stat}>{t("card.agents", { count: skill.agent_count ?? 0 })}</span>
        {isUntrusted(skill) && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn, var(--text-secondary))" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
    </div>
  );
}
