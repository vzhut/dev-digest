/* CompareModal — two runs of one agent: old (earlier) vs new (later) as decided by the server, never by
   selection order. Metric deltas, cost, cases passed, flipped cases, config changes and a line diff of
   the system prompt, all as plain text. No Promote: comparing never changes the agent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Skeleton } from "@devdigest/ui";
import type { EvalRunCompare } from "@devdigest/shared";
import { formatDelta, formatMetric, formatRunCost, progressLabel } from "@/lib/eval-format";
import { useEvalCompare } from "@/lib/hooks/eval";
import { useDialogKeys } from "./useDialogKeys";

const BODY = { padding: "4px 24px 20px", display: "flex", flexDirection: "column", gap: 14, fontSize: 13 } as const;
const H = { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", margin: "0 0 4px", textTransform: "uppercase" } as const;
const NOTE = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--bg-surface)" } as const;
const WARN = { ...NOTE, borderColor: "var(--warn)" } as const;
const PRE = { margin: 0, padding: 8, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, overflow: "auto", maxHeight: 260 } as const;
const LINE = {
  same: { color: "var(--text-secondary)" },
  add: { color: "var(--ok)", background: "var(--ok-bg, transparent)" },
  del: { color: "var(--crit)", background: "var(--crit-bg, transparent)" },
} as const;
const PREFIX = { same: "  ", add: "+ ", del: "- " } as const;

export function CompareModal({ a, b, onClose }: { a: string; b: string; onClose: () => void }) {
  const t = useTranslations("eval.agentView.compareModal");
  const q = useEvalCompare(a, b);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  useDialogKeys(bodyRef, onClose);

  return (
    <Modal width={820} title={t("title")} onClose={onClose}>
      <div ref={bodyRef} style={BODY}>
        {q.isError ? (
          <p>{t("loadError")}</p>
        ) : !q.data ? (
          <Skeleton height={160} />
        ) : (
          <CompareBody c={q.data} />
        )}
      </div>
    </Modal>
  );
}

function CompareBody({ c }: { c: EvalRunCompare }) {
  const t = useTranslations("eval.agentView.compareModal");
  const m = useTranslations("eval.agentView.metricName");
  const changes = c.prompt_diff.some((l) => l.op !== "same");
  const { provider, model, strategy, skills } = c.config_diff;
  return (
    <>
      <div style={{ fontWeight: 600 }}>
        {t("oldNew", { old: c.old.agent_version ?? "—", new: c.new.agent_version ?? "—" })}
      </div>
      {c.same_config && <div style={NOTE}>{t("sameConfig")}</div>}
      {(c.case_set.added > 0 || c.case_set.removed > 0) && (
        <div role="alert" style={WARN}>
          {t("caseSetWarning", { common: c.case_set.common, added: c.case_set.added, removed: c.case_set.removed })}
        </div>
      )}

      <section>
        <h3 style={H}>{t("metrics")}</h3>
        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            {c.metrics.map((x) => (
              <tr key={x.metric}>
                <td style={{ padding: "2px 16px 2px 0" }}>{m(x.metric)}</td>
                <td style={{ padding: "2px 16px 2px 0" }}>
                  {formatMetric(x.old)} → {formatMetric(x.new)}
                </td>
                <td>{formatDelta(x.delta)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: "2px 16px 2px 0" }}>{t("cost")}</td>
              <td colSpan={2}>
                {formatRunCost(c.cost.old, c.old.cost_partial)} → {formatRunCost(c.cost.new, c.new.cost_partial)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "2px 16px 2px 0" }}>{t("passed")}</td>
              <td colSpan={2}>
                {progressLabel(c.passed.old.passed, c.passed.old.total)} →{" "}
                {progressLabel(c.passed.new.passed, c.passed.new.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3 style={H}>{t("flipped")}</h3>
        {c.flipped_cases.length === 0 ? (
          <div>{t("noFlipped")}</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {c.flipped_cases.map((f) => (
              <li key={f.case_id}>
                {t("flippedRow", { name: f.case_name ?? f.case_id, old: f.old ?? "—", new: f.new ?? "—" })}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(provider || model || strategy || skills) && (
        <section>
          <h3 style={H}>{t("config")}</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {provider && <li>{t("provider")}: {provider.old} → {provider.new}</li>}
            {model && <li>{t("model")}: {model.old} → {model.new}</li>}
            {strategy && <li>{t("strategy")}: {strategy.old ?? "—"} → {strategy.new ?? "—"}</li>}
            {skills && (
              <li>
                {t("skills")}: {skills.old.join(", ") || "—"} → {skills.new.join(", ") || "—"}
              </li>
            )}
          </ul>
        </section>
      )}

      <section>
        <h3 style={H}>{t("prompt")}</h3>
        {!changes ? (
          <div>{t("promptSame")}</div>
        ) : (
          <pre className="mono" style={PRE}>
            {c.prompt_diff.map((l, i) => (
              <div key={i} style={LINE[l.op]}>
                {PREFIX[l.op]}
                {l.text}
              </div>
            ))}
          </pre>
        )}
      </section>
    </>
  );
}
