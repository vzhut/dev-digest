/* CompareModal — two runs of one agent: old (earlier) vs new (later) as decided by the server, never by
   selection order. Metric deltas, cost, cases passed, flipped cases, config changes and a line diff of
   the system prompt, all as plain text. No Promote: comparing never changes the agent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { EvalRunCompare } from "@devdigest/shared";
import { deltaColor, EVAL_METRIC_COLOR, formatDelta, formatMetric, formatRunCost, progressLabel } from "@/lib/eval-format";
import { useEvalCompare } from "@/lib/hooks/eval";
import { collapseDiff, hasChanges } from "./helpers";
import { useDialogKeys } from "./useDialogKeys";

const BODY = { padding: "4px 24px 20px", display: "flex", flexDirection: "column", gap: 14, fontSize: 13 } as const;
const H = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--text-muted)", margin: "0 0 4px", textTransform: "uppercase" } as const;
const TILES = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 } as const;
const TILE = { minWidth: 0, padding: "12px 16px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-surface)" } as const;
const TILE_LABEL = { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" } as const;
const BIG = { fontSize: 24, fontWeight: 600, marginTop: 8, overflowWrap: "anywhere" } as const;
const SMALL = { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 8px", marginTop: 4, fontSize: 12.5 } as const;
const TILE_VALUES = { display: "flex", alignItems: "baseline", gap: 8, marginTop: 8, flexWrap: "nowrap", whiteSpace: "nowrap" } as const;
const LEGEND = { display: "flex", gap: 16, fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 8 } as const;
const SWATCH = { display: "inline-block", width: 10, height: 10, borderRadius: 2, border: "1px solid var(--border-strong)", verticalAlign: "middle" } as const;
const NOTE = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--bg-surface)" } as const;
const WARN = { ...NOTE, borderColor: "var(--warn)" } as const;
const PRE = { padding: "6px 0", background: "var(--code-bg)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, maxHeight: 320, overflowY: "auto" } as const;
const ROW = { display: "flex", gap: 8, padding: "1px 12px" } as const;
const MARK = { width: 10, flexShrink: 0, userSelect: "none" } as const;
const TEXT = { flex: 1, minWidth: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" } as const;
const ROW_GAP = { padding: "3px 12px", color: "var(--text-muted)", fontStyle: "italic" } as const;
const LINE = {
  same: { color: "var(--text-muted)" },
  add: { color: "var(--code-add-text)", background: "var(--code-add)" },
  del: { color: "var(--code-del-text)", background: "var(--code-del)" },
} as const;
const MARKER = { same: " ", add: "+", del: "−" } as const;

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
  const changes = hasChanges(c.prompt_diff);
  const { provider, model, strategy, skills } = c.config_diff;
  return (
    <>
      {c.same_config && <div style={NOTE}>{t("sameConfig")}</div>}
      {(c.case_set.added > 0 || c.case_set.removed > 0) && (
        <div role="alert" style={WARN}>
          {t("caseSetWarning", { common: c.case_set.common, added: c.case_set.added, removed: c.case_set.removed })}
        </div>
      )}

      <div style={TILES}>
        {c.metrics.map((x) => (
          <div key={x.metric} style={TILE}>
            <div style={TILE_LABEL}>{m(x.metric)}</div>
            <div style={BIG} className="tnum" >
              <span style={{ color: EVAL_METRIC_COLOR[x.metric] }}>{formatMetric(x.new)}</span>
            </div>
            <div style={SMALL}>
              <span style={{ color: "var(--text-muted)" }}>{formatMetric(x.old)}</span>
              <span style={{ color: "var(--text-muted)" }}>→</span>
              <span style={{ color: "var(--text-secondary)" }}>{formatMetric(x.new)}</span>
              <span style={{ fontWeight: 600, color: deltaColor(x.delta) }}>{formatDelta(x.delta)}</span>
            </div>
          </div>
        ))}
        <div style={TILE}>
          <div style={TILE_LABEL}>{t("costLabel")}</div>
          <div style={BIG}>
            <span>{formatRunCost(c.cost.new, c.new.cost_partial)}</span>
          </div>
          <div style={SMALL}>
            <span style={{ color: "var(--text-muted)" }}>{formatRunCost(c.cost.old, c.old.cost_partial)}</span>
            <span style={{ color: "var(--text-muted)" }}>→</span>
            <span style={{ color: "var(--text-secondary)" }}>{formatRunCost(c.cost.new, c.new.cost_partial)}</span>
          </div>
        </div>
      </div>
      <div>
        <span style={H}>{t("passed")}</span>{" "}
        {progressLabel(c.passed.old.passed, c.passed.old.total)} → {progressLabel(c.passed.new.passed, c.passed.new.total)}
      </div>

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
        <h3 style={H}>
          <Icon.FileText size={13} /> {t("prompt")}
        </h3>
        <div style={LEGEND}>
          <span><span style={{ ...SWATCH, background: "var(--crit)" }} /> {t("legendOld", { version: c.old.agent_version ?? "—" })}</span>
          <span><span style={{ ...SWATCH, background: "var(--ok)" }} /> {t("legendNew", { version: c.new.agent_version ?? "—" })}</span>
        </div>
        {!changes ? (
          <div>{t("promptSame")}</div>
        ) : (
          <div className="mono" style={PRE}>
            {collapseDiff(c.prompt_diff).map((r, i) =>
              r.kind === "gap" ? (
                <div key={i} style={ROW_GAP}>
                  {t("unchangedLines", { count: r.count })}
                </div>
              ) : (
                <div key={i} style={{ ...ROW, ...LINE[r.op] }}>
                  <span style={MARK} aria-hidden="true">
                    {MARKER[r.op]}
                  </span>
                  <span style={TEXT}>{r.text || " "}</span>
                </div>
              ),
            )}
          </div>
        )}
      </section>
    </>
  );
}
