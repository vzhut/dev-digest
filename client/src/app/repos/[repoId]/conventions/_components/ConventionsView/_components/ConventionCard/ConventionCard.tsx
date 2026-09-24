/* ConventionCard — one extracted candidate: rule, evidence link + copy,
   snippet, confidence bar, Accept/Reject/Edit (C12). Rejected collapses to
   one line with Undo. Edit switches the rule to an inline field (Enter
   saves, Esc cancels), then shows an "edited" chip (C12). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, IconBtn, MonoLink, ProgressBar, TextInput } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { confidenceColor, confidencePct, formatLocation } from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  busy,
  onAccept,
  onReject,
  onUndo,
  onSaveRule,
}: {
  candidate: ConventionCandidate;
  busy?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
  onSaveRule: (rule: string) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(candidate.rule);
  const [copied, setCopied] = React.useState(false);

  const location = formatLocation(candidate.evidence_path, candidate.evidence_line_start, candidate.evidence_line_end);

  function startEdit() {
    setDraft(candidate.rule);
    setEditing(true);
  }
  function commitEdit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== candidate.rule) onSaveRule(trimmed);
  }
  function cancelEdit() {
    setDraft(candidate.rule);
    setEditing(false);
  }
  function copyPath() {
    navigator.clipboard?.writeText(candidate.evidence_path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  if (candidate.status === "rejected" && !editing) {
    return (
      <Card>
        <div style={s.collapsedRow}>
          <span style={s.collapsedRule}>{candidate.rule}</span>
          <Button size="sm" kind="ghost" onClick={onUndo}>
            {t("card.undo")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={s.card}>
        <div style={s.titleRow}>
          {editing ? (
            <TextInput
              value={draft}
              onChange={setDraft}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") cancelEdit();
              }}
            />
          ) : (
            <span style={s.rule}>{candidate.rule}</span>
          )}
          {candidate.edited && !editing && <Badge style={s.editedChip}>{t("card.edited")}</Badge>}
        </div>

        <div style={s.evidenceRow}>
          <MonoLink href={candidate.evidence_url}>{location}</MonoLink>
          <IconBtn
            icon={copied ? "Check" : "Copy"}
            size={22}
            label={t("card.copyPath")}
            onClick={copyPath}
          />
        </div>

        <pre style={s.snippet}>{candidate.evidence_snippet}</pre>

        <div style={s.confidenceRow}>
          <div style={s.confidenceBarWrap}>
            <ProgressBar value={confidencePct(candidate.confidence)} color={confidenceColor(candidate.confidence)} />
          </div>
          <span style={{ ...s.confidencePct, color: confidenceColor(candidate.confidence) }}>
            {t("card.confidencePct", { pct: confidencePct(candidate.confidence) })}
          </span>
        </div>

        <div style={s.actionsRow}>
          {editing ? (
            <>
              <Button size="sm" kind="primary" onClick={commitEdit}>
                {t("card.save")}
              </Button>
              <Button size="sm" kind="ghost" onClick={cancelEdit}>
                {t("card.cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                kind={candidate.status === "accepted" ? "primary" : "secondary"}
                icon="Check"
                onClick={onAccept}
                disabled={busy}
              >
                {t("card.accept")}
              </Button>
              <Button size="sm" kind="secondary" icon="X" onClick={onReject} disabled={busy}>
                {t("card.reject")}
              </Button>
              <Button size="sm" kind="ghost" icon="Edit" onClick={startEdit} disabled={busy}>
                {t("card.edit")}
              </Button>
              <div style={s.spacer} />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
