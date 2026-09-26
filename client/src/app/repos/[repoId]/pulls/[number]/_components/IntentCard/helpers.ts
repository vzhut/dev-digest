import type { IntentConfidence, IntentSource, PrIntentRecord } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format-cost";
import { CONFIDENCE_TONE, FIXED_SOURCE_KINDS } from "./constants";

export function confidenceTone(confidence: IntentConfidence) {
  return CONFIDENCE_TONE[confidence];
}

/** Sources that fed the classifier vs. the ones it could not read. */
export function sourceSummary(sources: readonly IntentSource[]) {
  const loaded: IntentSource[] = [];
  const unavailable: IntentSource[] = [];
  for (const src of sources) {
    (src.status === "missing" || src.status === "blocked" ? unavailable : loaded).push(src);
  }
  return { loaded, unavailable };
}

/** True when the source is shown by its fixed label (title, description, …) instead of its ref. */
export function hasFixedLabel(src: IntentSource): boolean {
  return FIXED_SOURCE_KINDS.has(src.kind);
}

/** Model + cost line parts. The model id loses its `vendor/` prefix; a null cost stays "—" (unknown, not free). */
export function formatIntentMeta(intent: Pick<PrIntentRecord, "model" | "cost_usd">) {
  return {
    model: intent.model ? (intent.model.split("/").pop() ?? intent.model) : null,
    cost: formatCostUsd(intent.cost_usd),
  };
}

/** The classifier's risk areas (blank and repeated entries dropped), or an empty list when the model omitted them. */
export function riskAreasOf(intent: Pick<PrIntentRecord, "risk_areas">): string[] {
  return [...new Set((intent.risk_areas ?? []).map((r) => r.trim()).filter((r) => r.length > 0))];
}
