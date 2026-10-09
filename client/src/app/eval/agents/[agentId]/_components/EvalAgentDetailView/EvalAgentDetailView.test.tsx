import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/eval.json";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ agentId: "a1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

const state = vi.hoisted(() => ({
  dash: undefined as unknown,
  all: { cards: [] } as unknown,
  compare: undefined as unknown,
  compareArgs: [] as unknown[],
  startMutate: vi.fn(),
}));
vi.mock("@/lib/hooks/eval", () => ({
  useAgentEvalDashboard: () => ({ data: state.dash, isError: false, refetch: vi.fn() }),
  useEvalDashboard: () => ({ data: state.all }),
  useStartEvalRun: () => ({ mutate: state.startMutate, isPending: false }),
  useEvalCompare: (a: string, b: string) => {
    state.compareArgs.push([a, b]);
    return { data: state.compare, isError: false };
  },
}));

import { EvalAgentDetailView } from "./EvalAgentDetailView";

afterEach(() => {
  cleanup();
  state.dash = undefined;
  state.compare = undefined;
  state.compareArgs = [];
  state.startMutate.mockReset();
});

const run = (over: Record<string, unknown>) => ({
  id: "r", agent_id: "a1", agent_version: 1, status: "completed", ran_at: "2026-10-01T09:00:00Z", finished_at: null,
  cases_done: 4, traces_passed: 3, traces_total: 4, cases_errored: 0, unlabeled: 0, recall: 0.8, precision: 0.8,
  citation_accuracy: 1, cost_usd: 0.1, cost_partial: false, duration_ms: 1000, ...over,
});
const point = (id: string, precision: number) => ({ run_id: id, ran_at: "2026-10-01T00:00:00Z", recall: 0.8, precision, citation_accuracy: 1, traces_passed: 3, traces_total: 4 });

const r1 = run({ id: "r1", agent_version: 1, ran_at: "2026-10-01T09:00:00Z" });
const r2 = run({ id: "r2", agent_version: 2, ran_at: "2026-10-02T09:00:00Z", precision: 0.74 });
const r3 = run({ id: "r3", agent_version: 3, ran_at: "2026-10-03T09:00:00Z" });

const base = (over: Record<string, unknown> = {}) => ({
  agent_id: "a1", agent_name: "General Reviewer", model: "m1", cases_total: 4,
  latest: r2, previous: r1, trend: [point("r1", 0.8), point("r2", 0.74)], runs: [r2, r1], regression: [], ...over,
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalAgentDetailView />
    </NextIntlClientProvider>,
  );
}
const pick = (name: RegExp) => fireEvent.click(screen.getByRole("checkbox", { name }));

describe("EvalAgentDetailView", () => {
  it("shows metric tiles with signed deltas, the trend, the run history and Run eval", () => {
    state.dash = base();
    renderView();
    expect(screen.getByRole("heading", { name: "General Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("▼ −6 pts")).toBeInTheDocument(); // precision 0.80 → 0.74, with arrow and sign
    expect(screen.getByRole("img", { name: "Recall, precision and citation accuracy over 2 runs" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Eval runs" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(state.startMutate).toHaveBeenCalledTimes(1);
  });

  it("names a regressed metric and its drop in a banner", () => {
    state.dash = base({ regression: [{ metric: "precision", drop: 0.06 }] });
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("Regression since the previous run: precision ▼ −6 pts");
  });

  it("explains the next step for an agent with cases but no runs (no zeros, no chart)", () => {
    state.dash = base({ latest: null, previous: null, trend: [], runs: [], regression: [] });
    renderView();
    expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run eval" })).toBeEnabled();
  });

  it("disables Run eval with no cases, and while a run is running", () => {
    state.dash = base({ cases_total: 0, latest: null, previous: null, runs: [], trend: [] });
    renderView();
    expect(screen.getByText("This agent has no eval cases")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();
    cleanup();
    state.dash = base({ runs: [run({ id: "r9", status: "running", cases_done: 2, traces_total: 5 }), r2, r1] });
    renderView();
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();
    expect(screen.getAllByRole("status").some((el) => el.textContent === "2 / 5 cases")).toBe(true);
  });

  it("Compare is enabled only with exactly two runs selected", () => {
    state.dash = base({ runs: [r3, r2, r1] });
    renderView();
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    pick(/Select run v1/);
    expect(compare).toBeDisabled();
    pick(/Select run v3/);
    expect(compare).toBeEnabled();
    pick(/Select run v2/);
    expect(compare).toBeDisabled();
  });

  describe("compare modal", () => {
    const compare = (over: Record<string, unknown> = {}) => ({
      old: run({ id: "r1", agent_version: 1, cost_partial: false }),
      new: run({ id: "r3", agent_version: 3, cost_partial: true }),
      same_config: false,
      metrics: [
        { metric: "recall", old: 0.8, new: 0.8, delta: 0 },
        { metric: "precision", old: 0.8, new: 0.5, delta: -0.3 },
        { metric: "citation_accuracy", old: 1, new: null, delta: null },
      ],
      cost: { old: 0.1, new: 0.2, partial: true },
      passed: { old: { passed: 3, total: 4 }, new: { passed: 1, total: 4 } },
      flipped_cases: [{ case_id: "c1", case_name: "must_find-a", old: "passed", new: "failed" }],
      config_diff: { provider: null, model: { old: "m1", new: "m2" }, strategy: null, skills: null },
      prompt_diff: [
        { op: "same", text: "You review code." },
        { op: "del", text: "Be terse." },
        { op: "add", text: "Flag <b>everything</b>." },
      ],
      case_set: { common: 3, added: 1, removed: 2 },
      ...over,
    });

    function open() {
      state.dash = base({ runs: [r3, r2, r1] });
      state.compare = compare();
      renderView();
      pick(/Select run v3/); // newer first on purpose
      pick(/Select run v1/);
      fireEvent.click(screen.getByRole("button", { name: "Compare" }));
      return screen.getByRole("dialog");
    }

    it("shows old before new regardless of selection order, with deltas, flipped cases, config and a prompt line diff as text", () => {
      const dialog = open();
      expect(state.compareArgs.at(-1)).toEqual(["r3", "r1"]);
      expect(dialog).toHaveTextContent("Compare runs · v1 → v3");
      expect(dialog).toHaveTextContent("precision80%→50%▼ −30 pts");
      expect(dialog).toHaveTextContent("citation accuracy100%→—");
      expect(dialog).toHaveTextContent("3 / 4 → 1 / 4");
      expect(dialog).toHaveTextContent("must_find-a: passed → failed");
      expect(dialog).toHaveTextContent("Model: m1 → m2");
      expect(dialog).toHaveTextContent("- Be terse.");
      expect(dialog).toHaveTextContent("+ Flag <b>everything</b>.");
      expect(dialog.querySelector("b")).toBeNull(); // plain text, never HTML
      expect(within(dialog).queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
    });

    it("warns with common / added / removed when the case sets differ", () => {
      expect(within(open()).getByRole("alert")).toHaveTextContent("Different case sets: 3 common, 1 added, 2 removed.");
    });

    it("says so when the two runs have the same config", () => {
      state.dash = base({ runs: [r3, r2, r1] });
      state.compare = compare({ same_config: true, case_set: { common: 4, added: 0, removed: 0 }, prompt_diff: [{ op: "same", text: "x" }] });
      renderView();
      pick(/Select run v3/);
      pick(/Select run v1/);
      fireEvent.click(screen.getByRole("button", { name: "Compare" }));
      expect(screen.getByRole("dialog")).toHaveTextContent("Same config");
      expect(screen.getByRole("dialog")).toHaveTextContent("The system prompt did not change.");
    });

    it("closes on Escape and keeps Tab inside the dialog", () => {
      const dialog = open();
      const close = within(dialog).getAllByRole("button", { name: "Close" })[0]!;
      close.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(dialog.contains(document.activeElement)).toBe(true);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
