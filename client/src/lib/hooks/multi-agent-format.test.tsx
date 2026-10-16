import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentRunEstimate } from "@devdigest/shared";
import messages from "../../../messages/en/multiAgent.json";
import { useMultiAgentFormat } from "./multi-agent-format";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
    {children}
  </NextIntlClientProvider>
);

const est = (agent_id: string, ms: number | null, usd: number | null): AgentRunEstimate => ({
  agent_id,
  est_duration_ms: ms,
  est_cost_usd: usd,
});

describe("useMultiAgentFormat", () => {
  const fmt = () => renderHook(() => useMultiAgentFormat(), { wrapper }).result.current;

  it("composes the per-agent estimate sentences", () => {
    const f = fmt();
    expect(f.estimate(est("a", 8200, 0.2))).toBe("≈ 8.2s · $0.20");
    expect(f.estimateCompact(est("a", 8200, 0.2))).toBe("8.2s · $0.20");
    expect(f.estimate(undefined)).toBe("no estimate");
    expect(f.estimateCompact(est("a", null, null))).toBe("no estimate");
  });

  it("composes the selection total from the slowest agent and the summed cost", () => {
    expect(fmt().total([est("a", 4000, 0.1), est("b", 8200, 0.1)])).toBe("≈ 8.2s · $0.20 · parallel fan-out");
  });

  it("composes the run meta line with a pluralised agent count", () => {
    const f = fmt();
    expect(f.runMeta(4, 8200, [0.1, 0.1, null])).toBe("4 agents · parallel · 8.2s total · $0.20");
    expect(f.runMeta(1, 8200, [0.1])).toBe("1 agent · parallel · 8.2s total · $0.10");
    expect(f.runMeta(2, null, [null, null])).toBe("2 agents · parallel · — total · —");
  });
});
