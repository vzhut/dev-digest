import { describe, it, expect, afterEach, beforeEach, vi, type MockInstance } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/eval.json";

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ agentId: "a1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

/* Real query client + hooks; only the network edge (`api.*`) is replaced. AppShell and the router stay mocked
   (they need the Next app context). */
const state = {
  dash: undefined as unknown,
  all: { cards: [], recent_runs: [] } as unknown,
  compare: undefined as unknown,
};
let spies: { start: MockInstance; compare: MockInstance };

import { EvalAgentDetailView } from "./EvalAgentDetailView";

beforeEach(() => {
  spies = {
    start: vi.spyOn(api, "startEvalRun").mockResolvedValue({ eval_run_id: "new", status: "running" }),
    compare: vi.spyOn(api, "compareEvalRuns").mockImplementation(async () => state.compare as never),
  };
  vi.spyOn(api, "getAgentEvalDashboard").mockImplementation(async () => state.dash as never);
  vi.spyOn(api, "getEvalDashboard").mockImplementation(async () => state.all as never);
});
afterEach(() => {
  cleanup();
  state.dash = undefined;
  state.compare = undefined;
  vi.restoreAllMocks();
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

async function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <EvalAgentDetailView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { level: 1 }); // the agent's data arrived
}
const pick = (name: RegExp) => fireEvent.click(screen.getByRole("checkbox", { name }));

describe("EvalAgentDetailView", () => {
  it("shows metric tiles with signed deltas, the trend, the run history and Run eval", async () => {
    state.dash = base();
    await renderView();
    expect(screen.getByRole("heading", { name: "General Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("▼ −6 pts")).toBeInTheDocument(); // precision 0.80 → 0.74, with arrow and sign
    expect(screen.getByRole("img", { name: "Recall, precision and citation accuracy over 2 runs" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Eval runs" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    await waitFor(() => expect(spies.start).toHaveBeenCalledTimes(1));
  });

  it("names a regressed metric and its drop in a banner", async () => {
    state.dash = base({ regression: [{ metric: "precision", drop: 0.06 }] });
    await renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("Regression since the previous run: precision ▼ −6 pts");
  });

  it("explains the next step for an agent with cases but no runs (no zeros, no chart)", async () => {
    state.dash = base({ latest: null, previous: null, trend: [], runs: [], regression: [] });
    await renderView();
    expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run eval" })).toBeEnabled();
  });

  it("disables Run eval with no cases, and while a run is running", async () => {
    state.dash = base({ cases_total: 0, latest: null, previous: null, runs: [], trend: [] });
    await renderView();
    expect(screen.getByText("This agent has no eval cases")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();
    cleanup();
    state.dash = base({ runs: [run({ id: "r9", status: "running", cases_done: 2, traces_total: 5 }), r2, r1] });
    await renderView();
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();
    expect(screen.getAllByRole("status").some((el) => el.textContent === "2 / 5 cases")).toBe(true);
  });

  it("Compare is enabled only with exactly two runs selected", async () => {
    state.dash = base({ runs: [r3, r2, r1] });
    await renderView();
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

    async function open() {
      state.dash = base({ runs: [r3, r2, r1] });
      state.compare = compare();
      await renderView();
      pick(/Select run v3/); // newer first on purpose
      pick(/Select run v1/);
      fireEvent.click(screen.getByRole("button", { name: "Compare" }));
      await screen.findByText(/^Compare runs · v/); // the comparison arrived
      return screen.getByRole("dialog");
    }

    it("shows old before new regardless of selection order, with deltas, flipped cases, config and a prompt line diff as text", async () => {
      const dialog = await open();
      expect(spies.compare).toHaveBeenLastCalledWith("r3", "r1");
      expect(dialog).toHaveTextContent("Compare runs · v1 → v3");
      expect(dialog).toHaveTextContent("precision50%80%→50%▼ −30 pts");
      expect(dialog).toHaveTextContent("citation accuracy—100%→—");
      expect(dialog).toHaveTextContent("3 / 4 → 1 / 4");
      expect(dialog).toHaveTextContent("must_find-a: passed → failed");
      expect(dialog).toHaveTextContent("Model: m1 → m2");
      const rows = within(dialog).getByText("Be terse.").closest("div")!;
      expect(rows).toHaveTextContent("−Be terse.");
      expect(within(dialog).getByText("Flag <b>everything</b>.").closest("div")).toHaveTextContent("+Flag <b>everything</b>.");
      expect(dialog.querySelector("b")).toBeNull(); // plain text, never HTML
      expect(within(dialog).queryByRole("button", { name: /promote/i })).not.toBeInTheDocument();
    });

    it("folds long unchanged runs of the prompt diff into an unchanged-lines row", async () => {
      state.dash = base({ runs: [r3, r2, r1] });
      const same = (p: string) => Array.from({ length: 12 }, (_, i) => ({ op: "same", text: `${p} ${i}` }));
      state.compare = compare({ prompt_diff: [...same("head"), { op: "add", text: "new rule" }, ...same("tail")] });
      await renderView();
      pick(/Select run v3/);
      pick(/Select run v1/);
      fireEvent.click(screen.getByRole("button", { name: "Compare" }));
      await screen.findByText(/^Compare runs · v/);
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("… 9 unchanged lines");
      expect(dialog).toHaveTextContent("new rule");
      expect(dialog).not.toHaveTextContent("head 0");
    });

    it("warns with common / added / removed when the case sets differ", async () => {
      expect(within(await open()).getByRole("alert")).toHaveTextContent("Different case sets: 3 common, 1 added, 2 removed.");
    });

    it("says so when the two runs have the same config", async () => {
      state.dash = base({ runs: [r3, r2, r1] });
      state.compare = compare({ same_config: true, case_set: { common: 4, added: 0, removed: 0 }, prompt_diff: [{ op: "same", text: "x" }] });
      await renderView();
      pick(/Select run v3/);
      pick(/Select run v1/);
      fireEvent.click(screen.getByRole("button", { name: "Compare" }));
      await screen.findByText(/^Compare runs · v/);
      expect(screen.getByRole("dialog")).toHaveTextContent("Same config");
      expect(screen.getByRole("dialog")).toHaveTextContent("No prompt changes");
    });

    it("closes on Escape", async () => {
      await open();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("traps Tab: from the last control it wraps to the first, from the first Shift+Tab wraps to the last", async () => {
      const dialog = await open();
      const focusables = [...dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      expect(first).not.toBe(last);
      last.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(first); // would stay on `last` / leave the dialog without the trap
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(last);
    });
  });
});
