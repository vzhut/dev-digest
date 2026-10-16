/**
 * RunReviewDropdown as the multi-agent picker (AC-1/2/5/44): enabled agents all checked, Clear,
 * Run disabled at 0, one request with the checked ids then navigation to ?run=<id>, the
 * Configure link, and the separate "Last multi-agent run" button.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReview from "../../../../../../../../messages/en/prReview.json";
import multiAgent from "../../../../../../../../messages/en/multiAgent.json";

const push = vi.fn();
const mutate = vi.fn();
const state: { agents: object[]; lastRun: { id: string | null } | undefined; pending: boolean } = {
  agents: [],
  lastRun: { id: null },
  pending: false,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useParams: () => ({ repoId: "r1" }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: state.agents }) }));
vi.mock("@/lib/hooks/reviews", () => ({
  useStartMultiAgentReview: () => ({ mutate, isPending: state.pending }),
  useAgentEstimates: () => ({
    data: [
      { agent_id: "a1", est_duration_ms: 8200, est_cost_usd: 0.1 },
      { agent_id: "a2", est_duration_ms: 4000, est_cost_usd: 0.1 },
    ],
  }),
  useLatestPrMultiAgentRun: () => ({ data: state.lastRun }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

const AGENTS = [
  { id: "a1", name: "Security", enabled: true },
  { id: "a2", name: "Performance", enabled: true },
  { id: "a3", name: "Dormant", enabled: false },
];

beforeEach(() => {
  push.mockReset();
  mutate.mockReset();
  state.agents = AGENTS;
  state.lastRun = { id: null };
  state.pending = false;
});
afterEach(cleanup);

function renderDropdown(props: Partial<React.ComponentProps<typeof RunReviewDropdown>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, multiAgent }}>
      <RunReviewDropdown prId="pr1" {...props} />
    </NextIntlClientProvider>,
  );
}
const open = () => fireEvent.click(screen.getByRole("button", { name: /Run Review/ }));

describe("RunReviewDropdown multi-agent picker", () => {
  it("opens with every enabled agent checked, supports Clear, and keeps Run disabled at zero", () => {
    renderDropdown();
    open();

    expect(screen.getByRole("dialog", { name: "Choose agents" })).toBeInTheDocument();
    expect(screen.queryByText("Dormant")).not.toBeInTheDocument();
    const sec = screen.getByRole("checkbox", { name: /Security/ });
    const perf = screen.getByRole("checkbox", { name: /Performance/ });
    expect(sec).toBeChecked();
    expect(perf).toBeChecked();
    expect(screen.getByText("≈ 8.2s · $0.10")).toBeInTheDocument();
    // Slowest agent (parallel) + summed cost.
    expect(screen.getByText("≈ 8.2s · $0.20 · parallel fan-out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run multi-agent review (2)" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(sec).not.toBeChecked();
    expect(perf).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Run multi-agent review (0)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("sends ONE request with exactly the checked ids, reports progress and opens ?run=<id>", () => {
    const onRunStart = vi.fn();
    const onRunsStarted = vi.fn();
    const onRunSettled = vi.fn();
    renderDropdown({ onRunStart, onRunsStarted, onRunSettled });
    open();

    fireEvent.click(screen.getByRole("checkbox", { name: /Security/ })); // uncheck
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (1)" }));

    expect(onRunStart).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({ prId: "pr1", agentIds: ["a2"] });

    const opts = mutate.mock.calls[0]![1] as { onSuccess: (r: unknown) => void; onSettled: () => void };
    act(() => opts.onSuccess({ multi_agent_run_id: "m5", runs: [{ run_id: "run-1" }, { run_id: "run-2" }] }));
    expect(onRunsStarted).toHaveBeenCalledWith(["run-1", "run-2"]);
    expect(push).toHaveBeenCalledWith("/repos/r1/multi-agent?run=m5");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    opts.onSettled();
    expect(onRunSettled).toHaveBeenCalledTimes(1);
  });

  it("links 'Configure agents…' to the Configure run form", () => {
    renderDropdown();
    open();
    expect(screen.getByRole("link", { name: "Configure agents…" })).toHaveAttribute(
      "href",
      "/repos/r1/multi-agent?configure=1",
    );
  });

  it("without enabled agents explains why and links to Agents instead of listing them", () => {
    state.agents = [AGENTS[2]!];
    renderDropdown();
    open();
    expect(screen.getByText(/You have no agents enabled yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Agents" })).toHaveAttribute("href", "/agents");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run multi-agent review/ })).not.toBeInTheDocument();
  });

  it("shows 'Last multi-agent run' only when the PR has one, and opens it", () => {
    renderDropdown();
    expect(screen.queryByRole("button", { name: "Last multi-agent run" })).not.toBeInTheDocument();
    cleanup();

    state.lastRun = { id: "m3" };
    renderDropdown();
    fireEvent.click(screen.getByRole("button", { name: "Last multi-agent run" }));
    expect(push).toHaveBeenCalledWith("/repos/r1/multi-agent?run=m3");
  });

  it("shows 'no estimate' for an agent without history", () => {
    state.agents = [{ id: "a9", name: "Fresh", enabled: true }];
    renderDropdown();
    open();
    expect(screen.getByText("no estimate")).toBeInTheDocument();
  });
});
