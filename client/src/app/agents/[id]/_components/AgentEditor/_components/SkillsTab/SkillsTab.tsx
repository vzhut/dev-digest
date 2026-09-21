"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, IconBtn, Skeleton, ErrorState, TextInput } from "@devdigest/ui";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import { useSkills, useAgentSkills, useSetAgentSkills } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { buildRows, countEnabled, dropRow, moveRow, toPayload, type SkillRow } from "./helpers";
import { s } from "./styles";

/** Skills tab — link, enable and reorder workspace skills for one agent. */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const skills = useSkills();
  const links = useAgentSkills(agent.id);

  if (skills.isError || links.isError) {
    return (
      <div style={s.wrap}>
        <ErrorState title={t("skills.loadError")} />
      </div>
    );
  }
  if (!skills.data || !links.data) {
    return (
      <div style={s.wrap}>
        <Skeleton height={120} />
      </div>
    );
  }
  return <SkillsEditor agent={agent} skills={skills.data} links={links.data} />;
}

function SkillsEditor({ agent, skills, links }: { agent: Agent; skills: Skill[]; links: AgentSkillLink[] }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const save = useSetAgentSkills();
  const [rows, setRows] = React.useState<SkillRow[]>(() => buildRows(skills, links));
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const q = filter.trim().toLowerCase();
  const visible = rows.filter((r) => !q || r.skill.name.toLowerCase().includes(q) || r.skill.description.toLowerCase().includes(q));
  const visibleIds = visible.map((r) => r.skill.id);

  const toggle = (id: string) =>
    setRows((rs) => rs.map((r) => (r.skill.id === id ? { ...r, checked: !r.checked } : r)));

  const onSave = () =>
    save.mutate(
      { agentId: agent.id, skills: toPayload(rows) },
      { onSuccess: () => toast.success(t("skills.savedToast")) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.counter}>{t("skills.enabledCount", { linked: countEnabled(rows), total: rows.length })}</span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <TextInput value={filter} onChange={setFilter} placeholder={t("skills.filterPlaceholder")} aria-label={t("skills.filterPlaceholder")} />
      {visible.length === 0 ? (
        <p style={s.empty}>{t("skills.noMatch")}</p>
      ) : (
        <ul style={s.list}>
          {visible.map((r) => {
            const { skill } = r;
            const off = !skill.enabled;
            return (
              <li
                key={skill.id}
                data-testid={`skill-row-${skill.id}`}
                draggable
                onDragStart={() => setDragId(skill.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverId(skill.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) setRows((rs) => dropRow(rs, dragId, skill.id));
                  setDragId(null);
                  setOverId(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                style={{ ...s.row, ...(overId === skill.id && dragId !== skill.id ? s.rowDragOver : null) }}
              >
                <span style={s.handle} title={t("skills.dragHandle", { name: skill.name })} aria-hidden>
                  ⠿
                </span>
                <label style={{ ...s.label, ...(off ? s.labelOff : null) }} title={off ? t("skills.disabledGloballyTitle") : undefined}>
                  <input type="checkbox" checked={r.checked && !off} disabled={off} onChange={() => toggle(skill.id)} />
                  <span>
                    <span style={s.name}>{skill.name}</span>
                    {off && (
                      <>
                        {" "}
                        <Badge>{t("skills.disabledGlobally")}</Badge>
                      </>
                    )}
                    <div style={s.desc}>{skill.description}</div>
                  </span>
                </label>
                <span style={s.arrows}>
                  <IconBtn icon="ArrowUp" size={26} label={t("skills.moveUp", { name: skill.name })} onClick={() => setRows((rs) => moveRow(rs, visibleIds, skill.id, -1))} />
                  <IconBtn icon="ArrowDown" size={26} label={t("skills.moveDown", { name: skill.name })} onClick={() => setRows((rs) => moveRow(rs, visibleIds, skill.id, 1))} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div style={s.actions}>
        <Button kind="primary" onClick={onSave} loading={save.isPending}>
          {save.isPending ? t("skills.saving") : t("skills.save")}
        </Button>
      </div>
    </div>
  );
}
