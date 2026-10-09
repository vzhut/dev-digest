/* CompareModal — two runs of one agent: old (earlier) vs new (later) as decided by the server, never by
   selection order. Metric deltas, cost, cases passed, flipped cases, config changes and a line diff of
   the system prompt, all as plain text. No Promote: comparing never changes the agent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { EvalRunCompare } from "@devdigest/shared";
import { deltaColor, EVAL_METRIC_COLOR, formatMetric, formatRunCost, progressLabel } from "@/lib/eval-format";
import { useEvalCompare } from "@/lib/hooks/eval";
import { useDeltaLabel } from "@/lib/use-delta-label";
import { useDialogKeys } from "@/lib/use-dialog-keys";
import { collapseDiff, hasChanges } from "./helpers";
import { MARKER, s } from "./styles";

export function CompareModal({ a, b, onClose }: { a: string; b: string; onClose: () => void }) {
  const t = useTranslations("eval.agentView.compareModal");
  const q = useEvalCompare(a, b);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  useDialogKeys(bodyRef, onClose);

  return (
    <Modal
      width={820}
      title={q.data ? t("titleVersions", { old: q.data.old.agent_version ?? "—", new: q.data.new.agent_version ?? "—" }) : t("title")}
      subtitle={q.data ? t("subtitle", { cases: Math.max(q.data.old.traces_total, q.data.new.traces_total) }) : undefined}
      onClose={onClose}
      footer={
        <Button kind="secondary" onClick={onClose}>
          {t("closeButton")}
        </Button>
      }
    >
      <div ref={bodyRef} style={s.body}>
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
  const deltaLabel = useDeltaLabel();
  const changes = hasChanges(c.prompt_diff);
  const { provider, model, strategy, skills } = c.config_diff;
  return (
    <>
      {c.same_config && <div style={s.note}>{t("sameConfig")}</div>}
      {(c.case_set.added > 0 || c.case_set.removed > 0) && (
        <div role="alert" style={s.warn}>
          {t("caseSetWarning", { common: c.case_set.common, added: c.case_set.added, removed: c.case_set.removed })}
        </div>
      )}

      <div style={s.tiles}>
        {c.metrics.map((x) => (
          <div key={x.metric} style={s.tile}>
            <div style={s.tileLabel}>{m(x.metric)}</div>
            <div style={s.big} className="tnum">
              <span style={s.metricColor(EVAL_METRIC_COLOR[x.metric])}>{formatMetric(x.new)}</span>
            </div>
            <div style={s.small}>
              <span style={s.muted}>{formatMetric(x.old)}</span>
              <span style={s.muted}>→</span>
              <span style={s.secondary}>{formatMetric(x.new)}</span>
              <span style={s.delta(deltaColor(x.delta))}>{deltaLabel(x.delta)}</span>
            </div>
          </div>
        ))}
        <div style={s.tile}>
          <div style={s.tileLabel}>{t("costLabel")}</div>
          <div style={s.big}>
            <span>{formatRunCost(c.cost.new, c.new.cost_partial)}</span>
          </div>
          <div style={s.small}>
            <span style={s.muted}>{formatRunCost(c.cost.old, c.old.cost_partial)}</span>
            <span style={s.muted}>→</span>
            <span style={s.secondary}>{formatRunCost(c.cost.new, c.new.cost_partial)}</span>
          </div>
        </div>
      </div>
      <div>
        <span style={s.h}>{t("passed")}</span>{" "}
        {progressLabel(c.passed.old.passed, c.passed.old.total)} → {progressLabel(c.passed.new.passed, c.passed.new.total)}
      </div>

      <section>
        <h3 style={s.h}>{t("flipped")}</h3>
        {c.flipped_cases.length === 0 ? (
          <div>{t("noFlipped")}</div>
        ) : (
          <ul style={s.list}>
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
          <h3 style={s.h}>{t("config")}</h3>
          <ul style={s.list}>
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
        <h3 style={s.h}>
          <Icon.FileText size={13} /> {t("prompt")}
        </h3>
        <div style={s.legend}>
          <span><span style={s.swatch("var(--crit)")} /> {t("legendOld", { version: c.old.agent_version ?? "—" })}</span>
          <span><span style={s.swatch("var(--ok)")} /> {t("legendNew", { version: c.new.agent_version ?? "—" })}</span>
        </div>
        {!changes ? (
          <div>{t("promptSame")}</div>
        ) : (
          <div className="mono" style={s.pre}>
            {collapseDiff(c.prompt_diff).map((r, i) =>
              r.kind === "gap" ? (
                <div key={i} style={s.gap}>
                  {t("unchangedLines", { count: r.count })}
                </div>
              ) : (
                <div key={i} style={{ ...s.row, ...s.line[r.op] }}>
                  <span style={s.mark} aria-hidden="true">
                    {MARKER[r.op]}
                  </span>
                  <span style={s.text}>{r.text || " "}</span>
                </div>
              ),
            )}
          </div>
        )}
      </section>
    </>
  );
}
