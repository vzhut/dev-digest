/* CreateSkillModal — prefilled from the current accepted candidates
   (skill-draft), editable Name/Description/body + token count, Attach to
   agents (C13), rename-or-update-existing on a name clash (C9). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, FormField, Modal, TextInput, Textarea } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { estimateTokens } from "@/lib/tokens";
import { notify } from "@/lib/toast";
import { useAgents } from "@/lib/hooks/agents";
import { useLinkSkillToAgent, useUpdateSkill } from "@/lib/hooks/skills";
import { useCreateConventionSkill, useSkillDraft } from "@/lib/hooks/conventions";
import { BODY_ROWS, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function CreateSkillModal({ repoId, onClose }: { repoId: string; onClose: () => void }) {
  const t = useTranslations("conventions.createSkillModal");
  const router = useRouter();
  const { data: agents } = useAgents();

  const draft = useSkillDraft(repoId);
  const create = useCreateConventionSkill(repoId);
  const updateExisting = useUpdateSkill();
  const linkAgent = useLinkSkillToAgent();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [body, setBody] = React.useState("");
  const [prefilled, setPrefilled] = React.useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<{ message: string; existingSkillId: string } | null>(null);

  // Runs once — the draft composes from whatever is accepted right now.
  React.useEffect(() => {
    draft.mutate(undefined, {
      onSuccess: (d) => {
        setName(d.name);
        setDescription(d.description);
        setBody(d.body);
        setPrefilled(true);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleAgent(id: string) {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function linkSelectedAgents(skillId: string) {
    await Promise.all([...selectedAgentIds].map((agentId) => linkAgent.mutateAsync({ agentId, skillId })));
  }

  async function submit() {
    setError(null);
    setConflict(null);
    try {
      const result = await create.mutateAsync({
        name: name.trim() || undefined,
        description,
        body,
        agent_ids: [...selectedAgentIds],
      });
      notify.success(t("created", { name: result.skill.name }));
      onClose();
      if (result.agent_ids_linked.length > 0) {
        router.push(`/agents/${result.agent_ids_linked[0]}?tab=skills`);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const details = e.details as { existing_skill_id?: string } | undefined;
        if (details?.existing_skill_id) {
          setConflict({ message: e.message, existingSkillId: details.existing_skill_id });
          return;
        }
      }
      setError(e instanceof Error ? e.message : t("failed"));
    }
  }

  async function updateExistingSkill() {
    if (!conflict) return;
    setError(null);
    try {
      await updateExisting.mutateAsync({
        id: conflict.existingSkillId,
        patch: { description, body, message: t("updateVersionMessage") },
      });
      await linkSelectedAgents(conflict.existingSkillId);
      notify.success(t("updated"));
      onClose();
      if (selectedAgentIds.size > 0) {
        router.push(`/agents/${[...selectedAgentIds][0]}?tab=skills`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("failed"));
    }
  }

  const busy = create.isPending || updateExisting.isPending || linkAgent.isPending;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("title")}
      subtitle={t("subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={busy || !prefilled || name.trim().length === 0}>
            {create.isPending ? t("creating") : t("create")}
          </Button>
        </div>
      }
    >
      <div style={s.form}>
        <FormField label={t("name")} required>
          <TextInput value={name} onChange={setName} mono />
        </FormField>
        <FormField label={t("description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <FormField label={t("body")} right={<span style={s.tokens}>{t("tokens", { count: estimateTokens(body) })}</span>}>
          <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
        </FormField>
        <FormField label={t("attachToAgents")} hint={t("attachHint")}>
          <div style={s.agentList}>
            {(agents ?? []).map((a) => (
              <Checkbox key={a.id} checked={selectedAgentIds.has(a.id)} onChange={() => toggleAgent(a.id)} label={a.name} />
            ))}
            {(agents ?? []).length === 0 && <span style={s.noAgents}>{t("noAgents")}</span>}
          </div>
        </FormField>
        <p style={s.versionNote}>{t("versionNote")}</p>

        {conflict && (
          <div role="alert" style={s.conflict}>
            <span style={s.conflictMessage}>{conflict.message}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" kind="secondary" onClick={updateExistingSkill} disabled={busy}>
                {t("updateExisting")}
              </Button>
              <span style={s.noAgents}>{t("orRenameHint")}</span>
            </div>
          </div>
        )}
        {error && (
          <div role="alert" style={s.error}>
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
