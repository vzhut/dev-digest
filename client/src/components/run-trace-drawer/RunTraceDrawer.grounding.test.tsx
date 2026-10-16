/** AC-29: the Stats section lists every finding the grounding pass dropped, with its location and reason. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../messages/en/runs.json";

const state: { trace: RunTrace } = { trace: {} as RunTrace };

vi.mock("@/lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: state.trace, isLoading: false }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import { RunTraceDrawer } from "./RunTraceDrawer";

afterEach(cleanup);

const baseTrace = (dropped?: RunTrace["grounding_dropped"]): RunTrace => ({
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 1, grounding: "1/3 passed" },
  prompt_assembly: { system: "sys", skills: null, memory: null, specs: null, user: "u" },
  tool_calls: [],
  raw_output: "{}",
  memory_pulled: [],
  specs_read: [],
  log: [],
  ...(dropped ? { grounding_dropped: dropped } : {}),
});

const renderDrawer = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">
        <RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />
      </div>
    </NextIntlClientProvider>,
  );

describe("RunTraceDrawer grounding_dropped", () => {
  it("lists each dropped finding with title, file:line(-range) and reason", () => {
    state.trace = baseTrace([
      { title: "Phantom SQL injection", file: "src/db.ts", start_line: 10, end_line: 14, reason: "line does not exist" },
      { title: "Unused import", file: "src/a.ts", start_line: 3, end_line: 3, reason: "quote not found in diff" },
    ]);
    renderDrawer();

    expect(screen.getByText("Phantom SQL injection")).toBeInTheDocument();
    expect(screen.getByText("src/db.ts:10-14")).toBeInTheDocument();
    expect(screen.getByText(/line does not exist/)).toBeInTheDocument();
    expect(screen.getByText("Unused import")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:3")).toBeInTheDocument();
    expect(screen.getByText(/quote not found in diff/)).toBeInTheDocument();
  });

  it("shows no dropped list when nothing was dropped", () => {
    state.trace = baseTrace([]);
    renderDrawer();
    expect(screen.getByText("1/3 passed")).toBeInTheDocument();
    expect(screen.queryByText("Phantom SQL injection")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
