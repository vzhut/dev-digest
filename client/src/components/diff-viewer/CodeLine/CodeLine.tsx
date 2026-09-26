/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import type { FindingRecord } from "@devdigest/shared";
import { Badge, SEV } from "@devdigest/ui";
import { SEVERITY_LABEL_KEY, topSeverity, type DiffFindingApi } from "../findings";
import { s, fs, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings = [],
  findingApi,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Findings anchored to this line. */
  findings?: FindingRecord[];
  findingApi?: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  const tr = useTranslations("prReview");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const showFindings = !!findingApi && findingApi.show && findings.length > 0;
  const sevKey = showFindings ? topSeverity(findings) : null;
  const sev = sevKey ? SEV[sevKey as keyof typeof SEV] : undefined;
  const sevLabelKey = sevKey ? SEVERITY_LABEL_KEY[sevKey] : undefined;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={{
          ...lineRowFor(ln.kind),
          // Longhands only: a state-dependent `borderColor` shorthand warns.
          ...(sev ? { borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: sev.c } : null),
        }}
      >
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title={t("diffViewer.addComment")}
              aria-label={t("diffViewer.addComment")}
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {sev && sevLabelKey && (
          <Badge
            icon={sev.icon}
            color={sev.c}
            bg={`color-mix(in srgb, ${sev.c} 12%, transparent)`}
            style={{ ...fs.label, border: `1px solid ${sev.c}` }}
          >
            {tr(sevLabelKey)}
          </Badge>
        )}
      </div>

      {showFindings && findingApi && (
        <div style={fs.rail}>
          {findings.map((f) => (
            <findingApi.FindingView key={f.id} finding={f} />
          ))}
        </div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
