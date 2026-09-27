"use client";

import { useTranslations } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { GRAPH_MAX_CALLERS_PER_SYMBOL, GRAPH_MAX_NODES } from "./constants";
import { toMermaidFlowchart } from "./helpers";
import { s } from "./styles";

/**
 * Graph view of the same data `SymbolList` renders as nested lists: each
 * changed symbol, its (capped) callers, and the endpoints/crons affected
 * through it, laid out by mermaid as a `flowchart LR`. Renders `graph.empty`
 * text instead of a chart when there is no downstream impact.
 */
export function BlastGraph({ downstream }: { downstream: BlastRadius["downstream"] }) {
  const t = useTranslations("blast");
  const chart = toMermaidFlowchart(
    { downstream },
    { maxCallersPerSymbol: GRAPH_MAX_CALLERS_PER_SYMBOL, maxNodes: GRAPH_MAX_NODES },
  );

  if (!chart) {
    return <p style={s.empty}>{t("graph.empty")}</p>;
  }

  return (
    <div aria-label={t("graph.ariaLabel")} style={s.container}>
      <MermaidDiagram chart={chart} />
    </div>
  );
}
