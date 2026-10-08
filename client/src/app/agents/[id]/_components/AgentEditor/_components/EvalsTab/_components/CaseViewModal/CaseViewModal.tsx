/* CaseViewModal — a case, read-only: the frozen diff and expectation (plain text) and a link to
   the source PR. There is deliberately no editor: a case is frozen at creation. */
"use client";

import { useTranslations } from "next-intl";
import { Modal, Skeleton } from "@devdigest/ui";
import { useEvalCase } from "@/lib/hooks/eval";
import { sourcePrUrl } from "../../helpers";

const PRE = {
  margin: 0,
  padding: 12,
  maxHeight: 320,
  overflow: "auto",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 12,
  whiteSpace: "pre",
} as const;
const BODY = { padding: "0 24px 20px" } as const;
const LABEL = { fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", margin: "12px 0 4px" } as const;

export function CaseViewModal({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const t = useTranslations("eval.tab.case");
  const detail = useEvalCase(caseId);
  const c = detail.data;
  const prUrl = c ? sourcePrUrl(c.meta) : null;

  return (
    <Modal width={720} title={c?.name ?? t("loading")} onClose={onClose}>
      {detail.isError ? (
        <p style={BODY}>{t("loadError")}</p>
      ) : !c ? (
        <div style={BODY}>
          <Skeleton height={160} />
        </div>
      ) : (
        <div style={BODY}>
          <div style={LABEL}>{t("expectation")}</div>
          <div className="mono" style={{ fontSize: 13 }}>
            {c.expectation.type} · {c.expectation.file}:{c.expectation.start_line}-{c.expectation.end_line}
            {c.expectation.label ? ` · ${c.expectation.label.title}` : ""}
          </div>
          <div style={LABEL}>{t("sourcePr")}</div>
          {prUrl ? (
            <a href={prUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
              {t("openPr", { repo: c.meta.repo, number: c.meta.pr_number })}
            </a>
          ) : (
            <span className="mono" style={{ fontSize: 13 }}>
              {c.meta.repo} #{c.meta.pr_number}
            </span>
          )}
          <div style={LABEL}>{t("diff")}</div>
          <pre className="mono" style={PRE}>
            {c.input_diff}
          </pre>
        </div>
      )}
    </Modal>
  );
}
