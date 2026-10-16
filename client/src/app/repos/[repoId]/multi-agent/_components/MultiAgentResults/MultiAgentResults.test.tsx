/**
 * MultiAgentResults: loading / error states, Columns vs Tabs mode, the always-present conflicts
 * section, and that "View trace" opens the shared trace drawer for that agent's run.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import multiAgent from "../../../../../../../messages/en/multiAgent.json";

const refetch = vi.fn();
const state: { query: Record<string, unknown> } = { query: {} };

vi.mock("@/lib/hooks/reviews", () => ({
  useMultiAgentRun: () => state.query,
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
  useRunEvents: () => ({ events: [], running: false }),
}));
vi.mock("@/components/finding-card", () => ({
  FindingCard: ({ f }: { f: { title: string } }) => <div>finding:{f.title}</div>,
}));
vi.mock("@/components/run-trace-drawer", () => ({
  RunTraceDrawer: ({ runId, agentName, onClose }: { runId: string; agentName: string; onClose: () => void }) => (
    <div role="dialog" aria-label="trace">
      trace:{runId}:{agentName}
      <button onClick={onClose}>close-trace</button>
    </div>
  ),
}));

import { MultiAgentResults } from "./MultiAgentResults";

const RUN = {
  id: "m1",
  pr_id: "pr1",
  pr_number: 482,
  pr_title: "Add rate limiting",
  ran_at: "2026-10-13T10:00:00.000Z",
  status: "done",
  agent_count: 2,
  total_duration_ms: 8200,
  total_cost_usd: 0.2,
  columns: [
    { run_id: "run-sec", agent_id: "sec", agent_name: "Security Reviewer", status: "done", score: 85, summary: "ok", duration_ms: 8200, cost_usd: 0.1, error: null, findings: [] },
    { run_id: "run-perf", agent_id: "perf", agent_name: "Performance Reviewer", status: "failed", score: null, summary: null, duration_ms: 1000, cost_usd: 0.1, error: "boom", findings: [] },
  ],
  conflicts: [],
};

beforeEach(() => {
  refetch.mockReset();
  state.query = { data: RUN, isLoading: false, isError: false, error: null, refetch };
});
afterEach(cleanup);

const renderResults = (mode: "columns" | "tabs") =>
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent }}>
      <MultiAgentResults runId="m1" mode={mode} />
    </NextIntlClientProvider>,
  );

describe("MultiAgentResults", () => {
  it("columns mode: header, one section per agent, the conflicts section, and a trace drawer per View trace", () => {
    renderResults("columns");

    expect(screen.getByText("#482")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Performance Reviewer" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Where agents disagree" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "trace" })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByText("View trace")[1]!);
    expect(screen.getByRole("dialog", { name: "trace" })).toHaveTextContent("trace:run-perf:Performance Reviewer");

    fireEvent.click(screen.getByText("close-trace"));
    expect(screen.queryByRole("dialog", { name: "trace" })).not.toBeInTheDocument();
  });

  it("tabs mode renders the tab strip instead of the columns", () => {
    renderResults("tabs");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.queryByRole("region", { name: "Security Reviewer" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Where agents disagree" })).toBeInTheDocument();
  });

  it("shows no results while loading", () => {
    state.query = { data: undefined, isLoading: true, isError: false, error: null, refetch };
    renderResults("columns");
    expect(screen.queryByText("#482")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error with a working retry when the run cannot be loaded", () => {
    state.query = { data: undefined, isLoading: false, isError: true, error: new Error("net"), refetch };
    renderResults("columns");

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load this multi-agent run.");
    fireEvent.click(screen.getByRole("button"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
