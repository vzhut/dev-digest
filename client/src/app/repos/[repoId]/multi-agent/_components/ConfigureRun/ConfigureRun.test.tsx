/**
 * ConfigureRun (AC-2/3/4/27): no PR => the agent list is replaced by "Pick a pull request first"
 * and the run button is disabled; only enabled agents are offered, none checked; the total line
 * appears once something is checked; the run posts exactly the checked ids and opens ?run=<id>.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import multiAgent from "../../../../../../../messages/en/multiAgent.json";

const push = vi.fn();
const mutate = vi.fn();
const AGENTS = [
  { id: "a1", name: "Security Reviewer", description: "Finds vulnerabilities", enabled: true },
  { id: "a2", name: "Performance Reviewer", description: "Finds slow code", enabled: true },
  { id: "a3", name: "Disabled Reviewer", description: "Should never show", enabled: false },
];
const state: { agents: object[] | undefined; loading: boolean; pending: boolean } = {
  agents: AGENTS,
  loading: false,
  pending: false,
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: state.agents, isLoading: state.loading }),
}));
vi.mock("@/lib/hooks/core", () => ({
  usePulls: () => ({ data: [{ id: "pr1", number: 12, title: "Add rate limiting" }, { id: null, number: 13, title: "No id" }] }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useAgentEstimates: () => ({
    data: [
      { agent_id: "a1", est_duration_ms: 8200, est_cost_usd: 0.1 },
      { agent_id: "a2", est_duration_ms: 4000, est_cost_usd: 0.1 },
    ],
  }),
  useStartMultiAgentReview: () => ({ mutate, isPending: state.pending }),
}));

import { ConfigureRun } from "./ConfigureRun";

beforeEach(() => {
  push.mockReset();
  mutate.mockReset();
  state.agents = AGENTS;
  state.loading = false;
  state.pending = false;
});
afterEach(cleanup);

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent }}>
      <ConfigureRun repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("ConfigureRun", () => {
  it("without a PR shows the pick-a-PR placeholder instead of agents and disables Run", () => {
    renderForm();

    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();
    expect(screen.queryByText("Security Reviewer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select all" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run multi-agent review (0)" })).toBeDisabled();
    expect(screen.queryByText(/parallel fan-out/)).not.toBeInTheDocument();
    // Only PRs that exist in the DB (have an id) are offered.
    expect(screen.getByRole("option", { name: "#12 Add rate limiting" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /No id/ })).not.toBeInTheDocument();
  });

  it("lists enabled agents unchecked, then selects, totals and posts exactly the checked ids", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Pull request"), { target: { value: "pr1" } });

    expect(screen.queryByText("Pick a pull request first")).not.toBeInTheDocument();
    expect(screen.queryByText("Disabled Reviewer")).not.toBeInTheDocument();
    const sec = screen.getByRole("checkbox", { name: /Security Reviewer/ });
    const perf = screen.getByRole("checkbox", { name: /Performance Reviewer/ });
    expect(sec).not.toBeChecked();
    expect(perf).not.toBeChecked();
    // Per-agent compact estimates, and no total line / enabled run until something is checked.
    expect(screen.getByText("8.2s · $0.10")).toBeInTheDocument();
    expect(screen.getByText("4.0s · $0.10")).toBeInTheDocument();
    expect(screen.queryByText(/parallel fan-out/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run multi-agent review (0)" })).toBeDisabled();

    // Select all => both checked; total = slowest agent (8.2s) + summed cost ($0.20).
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(sec).toBeChecked();
    expect(perf).toBeChecked();
    expect(screen.getByText("≈ 8.2s · $0.20 · parallel fan-out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run multi-agent review (2)" })).toBeEnabled();

    // Uncheck the slow one => total follows the remaining selection.
    fireEvent.click(sec);
    expect(screen.getByText("≈ 4.0s · $0.10 · parallel fan-out")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (1)" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({ prId: "pr1", agentIds: ["a2"] });

    // The server answers with the parent run id => the results page opens.
    const opts = mutate.mock.calls[0]![1] as { onSuccess: (r: unknown) => void };
    opts.onSuccess({ multi_agent_run_id: "m9", runs: [] });
    expect(push).toHaveBeenCalledWith("/repos/r1/multi-agent?run=m9");
  });

  it("does not navigate when the response carries no parent run id", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Pull request"), { target: { value: "pr1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Security Reviewer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (1)" }));
    (mutate.mock.calls[0]![1] as { onSuccess: (r: unknown) => void }).onSuccess({ runs: [] });
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps Run disabled while the start request is pending", () => {
    state.pending = true;
    renderForm();
    fireEvent.change(screen.getByLabelText("Pull request"), { target: { value: "pr1" } });
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByRole("button", { name: /Run multi-agent review \(2\)/ })).toBeDisabled();
  });

  it("with no enabled agents shows the enable-agents empty state that leads to /agents", () => {
    state.agents = [AGENTS[2]!];
    renderForm();

    expect(screen.getByText("Enable agents to run reviews")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Multi-agent review runs the PR through every enabled agent in parallel. You have no agents enabled yet.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Pull request")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Go to Agents" }));
    expect(push).toHaveBeenCalledWith("/agents");
  });

  it("shows neither the form nor the empty state while agents load", () => {
    state.loading = true;
    state.agents = undefined;
    renderForm();
    expect(screen.queryByLabelText("Pull request")).not.toBeInTheDocument();
    expect(screen.queryByText("Enable agents to run reviews")).not.toBeInTheDocument();
  });
});
