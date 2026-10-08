import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import messages from "../../../messages/en/eval.json";
import { EvalRunHistory } from "./EvalRunHistory";

afterEach(cleanup);

const run = (over: Partial<EvalSuiteRun> & { id: string; ran_at: string }): EvalSuiteRun => ({
  agent_id: "a1",
  agent_version: 1,
  status: "completed",
  finished_at: over.ran_at,
  cases_done: 3,
  traces_passed: 2,
  traces_total: 3,
  cases_errored: 0,
  unlabeled: 0,
  recall: 0.5,
  precision: 0.75,
  citation_accuracy: 1,
  cost_usd: 0.02,
  cost_partial: false,
  duration_ms: 1000,
  ...over,
});

function renderHistory(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const at = (h: number) => new Date(2026, 9, 8, h, 14).toISOString();

describe("EvalRunHistory", () => {
  it("lists runs newest first whatever order they arrive in, with metrics, p / n and cost", () => {
    renderHistory(
      <EvalRunHistory
        runs={[
          run({ id: "r2", ran_at: at(10), agent_version: 2, recall: null }),
          run({ id: "r3", ran_at: at(11), agent_version: 3, cost_usd: 0.02, cost_partial: true }),
          run({ id: "r1", ran_at: at(9), agent_version: 1 }),
        ]}
      />,
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByText(/^v\d$/).textContent)).toEqual(["v3", "v2", "v1"]);
    expect(within(rows[1]!).getAllByText("—").length).toBeGreaterThan(0); // null recall is a dash
    expect(within(rows[0]!).getByText("2 / 3")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("≥ $0.020")).toBeInTheDocument(); // partial marker, never plain
  });

  it("shows progress for a running run and the checkbox by its accessible name", () => {
    const onToggle = vi.fn();
    renderHistory(
      <EvalRunHistory
        selectable
        onToggle={onToggle}
        runs={[run({ id: "r7", ran_at: at(9), agent_version: 7, status: "running", cases_done: 2, traces_total: 5 })]}
      />,
    );
    expect(screen.getByText("2 / 5 cases")).toBeInTheDocument();
    const box = screen.getByRole("checkbox", { name: "Select run v7, 2026-10-08 09:14" });
    fireEvent.click(box);
    expect(onToggle).toHaveBeenCalledWith("r7");
  });

  it("shows an empty message with no runs", () => {
    renderHistory(<EvalRunHistory runs={[]} />);
    expect(screen.getByText("No eval runs yet.")).toBeInTheDocument();
  });
});
