import type { BlastRadius } from "@devdigest/shared";

export interface MermaidFlowchartOptions {
  maxCallersPerSymbol: number;
  maxNodes: number;
}

/**
 * Repo-derived text (symbol names, file paths, endpoint routes) reaches this
 * string verbatim before it is handed to mermaid, so it is escaped rather
 * than trusted: `"` becomes the mermaid entity `#quot;` (a raw quote would
 * close the node label early) and newlines/backticks/brackets/parens/angle
 * brackets are stripped outright — mermaid uses them for its own node/edge
 * syntax, so leaving them in lets crafted input break out of a label
 * (security A05 — injection into the diagram source).
 */
export function escapeMermaidLabel(label: string): string {
  return label.replace(/"/g, "#quot;").replace(/[\n\r`[\]{}()<>]/g, "");
}

/**
 * A `flowchart LR` chart mapping each changed symbol to its (capped) callers
 * and the endpoints/crons affected through it — the same data as
 * `SymbolList`, laid out as a graph instead of nested lists. Node ids are
 * assigned sequentially per kind (`s0, s1, …` symbols; `c0, c1, …` callers;
 * `e0, e1, …` endpoints/crons) as nodes are emitted, and generation stops as
 * soon as `maxNodes` distinct nodes have been created. Returns `null` when
 * there is nothing to graph, so the caller can show `graph.empty` instead of
 * an empty diagram.
 */
export function toMermaidFlowchart(
  blast: Pick<BlastRadius, "downstream">,
  { maxCallersPerSymbol, maxNodes }: MermaidFlowchartOptions,
): string | null {
  if (blast.downstream.length === 0) return null;

  const lines: string[] = ["flowchart LR"];
  let nodeCount = 0;
  let symbolIndex = 0;
  let callerIndex = 0;
  let leafIndex = 0;

  outer: for (const group of blast.downstream) {
    if (nodeCount >= maxNodes) break;

    const symbolId = `s${symbolIndex++}`;
    const symbolLabel = escapeMermaidLabel(group.symbol);
    nodeCount++;

    const callers = group.callers.slice(0, maxCallersPerSymbol);
    const leaves = [...group.endpoints_affected, ...group.crons_affected];

    if (callers.length === 0 && leaves.length === 0) {
      lines.push(`${symbolId}["${symbolLabel}"]`);
      continue;
    }

    for (const caller of callers) {
      if (nodeCount >= maxNodes) break outer;
      const callerId = `c${callerIndex++}`;
      const callerLabel = escapeMermaidLabel(`${caller.file}:${caller.line}`);
      lines.push(`${symbolId}["${symbolLabel}"] --> ${callerId}["${callerLabel}"]`);
      nodeCount++;
    }

    for (const leaf of leaves) {
      if (nodeCount >= maxNodes) break outer;
      const leafId = `e${leafIndex++}`;
      const leafLabel = escapeMermaidLabel(leaf);
      lines.push(`${symbolId}["${symbolLabel}"] --> ${leafId}["${leafLabel}"]`);
      nodeCount++;
    }
  }

  return lines.length > 1 ? lines.join("\n") : null;
}
