import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/eval.json";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const state = vi.hoisted(() => ({
  data: undefined as unknown,
  runAllMutate: vi.fn(),
}));
vi.mock("@/lib/hooks/eval", () => ({
  useEvalDashboard: () => ({ data: state.data, isError: false, refetch: vi.fn() }),
  useRunAllEvals: () => ({ mutate: state.runAllMutate, isPending: false }),
}));

import { EvalDashboardView } from "./EvalDashboardView";

afterEach(() => {
  cleanup();
  state.data = undefined;
  state.runAllMutate.mockReset();
});

const run = (over: Record<string, unknown>) => ({
  id: "r", agent_id: "a1", agent_version: 3, status: "completed", ran_at: new Date().toISOString(), finished_at: null,
  cases_done: 4, traces_passed: 3, traces_total: 4, cases_errored: 0, unlabeled: 0, recall: 0.5, precision: 0.8,
  citation_accuracy: 1, cost_usd: 0.1, cost_partial: false, duration_ms: 1, ...over,
});
const point = (passed: number) => ({ run_id: `p${passed}`, ran_at: "2026-10-01T00:00:00Z", recall: 1, precision: 1, citation_accuracy: 1, traces_passed: passed, traces_total: 4 });

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalDashboardView />
    </NextIntlClientProvider>,
  );
}

const TWO_AGENTS = {
  cards: [
    { agent_id: "a1", agent_name: "General Reviewer", model: "m1", cases_total: 4, latest_run: run({}), trend: [point(1), point(2), point(3)] },
    { agent_id: "a2", agent_name: "Security Reviewer", model: "m2", cases_total: 2, latest_run: null, trend: [] },
  ],
  recent_runs: [
    { ...run({ id: "old", agent_version: 1, ran_at: "2026-10-01T09:00:00Z" }), agent_name: "General Reviewer" },
    { ...run({ id: "new", agent_version: 2, ran_at: "2026-10-05T09:00:00Z", recall: null }), agent_name: "Security Reviewer" },
  ],
};

describe("EvalDashboardView", () => {
  it("shows one card per agent with metrics, p / n and a sparkline, linking to the agent's view", () => {
    state.data = TWO_AGENTS;
    renderView();
    const link = screen.getByRole("link", { name: /General Reviewer/ });
    expect(link).toHaveAttribute("href", "/eval/agents/a1");
    expect(within(link).getByText("50%")).toBeInTheDocument();
    expect(within(link).getByText("80%")).toBeInTheDocument();
    expect(within(link).getByText("100%")).toBeInTheDocument();
    expect(within(link).getByText(/3\/4 pass/)).toBeInTheDocument();
    expect(within(link).getByText(/v3/)).toBeInTheDocument();
    expect(within(link).getByRole("img", { name: "Pass rate over the last 3 runs" })).toBeInTheDocument();
    const other = screen.getByRole("link", { name: /Security Reviewer/ });
    expect(other).toHaveAttribute("href", "/eval/agents/a2");
    expect(within(other).getByText(/^No runs yet/)).toBeInTheDocument();
    expect(within(other).queryByRole("img")).not.toBeInTheDocument();
  });

  it("lists recent runs newest first", () => {
    state.data = TWO_AGENTS;
    renderView();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Security Reviewer");
    expect(rows[1]).toHaveTextContent("General Reviewer");
  });

  it("with no cases anywhere shows an explicit empty state and no chart or table", () => {
    state.data = { cards: [], recent_runs: [] };
    renderView();
    expect(screen.getByText("No eval cases yet")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run all agents" })).not.toBeInTheDocument();
  });

  it("Run all agents reports which agents were started and which skipped", () => {
    state.data = TWO_AGENTS;
    state.runAllMutate.mockImplementation((_v: unknown, o: { onSuccess: (r: unknown) => void }) =>
      o.onSuccess({ started: ["a1"], skipped: [{ agent_id: "a2", reason: "eval_run_in_progress" }] }),
    );
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    const report = screen.getByRole("status");
    expect(report).toHaveTextContent("Started: General Reviewer");
    expect(report).toHaveTextContent("Skipped: Security Reviewer (already running)");
  });
});
