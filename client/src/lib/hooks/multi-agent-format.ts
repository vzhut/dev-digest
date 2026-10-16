"use client";

import { useTranslations } from "next-intl";
import type { AgentRunEstimate } from "@devdigest/shared";
import { estimateParts, runMetaParts, selectionTotalParts } from "@/lib/multi-agent-format";

/** Translated sentences around the pure duration/cost parts (see `multiAgent.format.*`). */
export function useMultiAgentFormat() {
  const t = useTranslations("multiAgent.format");
  return {
    estimate(est: AgentRunEstimate | null | undefined): string {
      const parts = estimateParts(est);
      return parts ? t("estimate", parts) : t("noEstimate");
    },
    /** "8.2s · $0.06" (no ≈), for the per-agent cards. */
    estimateCompact(est: AgentRunEstimate | null | undefined): string {
      const parts = estimateParts(est);
      return parts ? t("estimateCompact", parts) : t("noEstimate");
    },
    total(estimates: AgentRunEstimate[]): string {
      return t("total", selectionTotalParts(estimates));
    },
    runMeta(
      agentCount: number,
      totalDurationMs: number | null | undefined,
      costs: Array<number | null | undefined>,
    ): string {
      return t("runMeta", { count: agentCount, ...runMetaParts(totalDurationMs, costs) });
    },
  };
}
