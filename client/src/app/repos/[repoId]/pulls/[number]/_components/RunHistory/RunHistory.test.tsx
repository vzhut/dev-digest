/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingPreview, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.0013,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — run cost", () => {
  it("a settled run shows total tokens and cost", () => {
    renderRuns([run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013 })]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("an unpriced run shows '—', never $0.00", () => {
    renderRuns([run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: null })]);
    expect(screen.getByText("9,119 tok · —")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it("a running run shows no cost — its usage is not final yet", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.queryByText(/tok ·/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — findings popover", () => {
  const preview = (id: string, severity: FindingPreview["severity"]): FindingPreview => ({
    id,
    severity,
    category: "security",
    title: `Finding ${id}`,
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    confidence: 0.9,
    summary: `Summary ${id}`,
  });
  const findingsTrigger = () => screen.queryByRole("button", { name: /findings? in this run/ });

  it("a settled run with findings shows severity icons, keeps the blockers text, and previews on hover", () => {
    renderRuns([
      run({
        status: "done",
        findings_count: 3,
        blockers: 2,
        score: 38,
        findings: [preview("c1", "CRITICAL"), preview("c2", "CRITICAL"), preview("w1", "WARNING")],
      }),
    ]);
    const trigger = findingsTrigger()!;
    expect(trigger.textContent).toBe("21"); // 2 CRITICAL, 1 WARNING
    expect(screen.queryByText(/finding\(s\)/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();

    fireEvent.mouseEnter(trigger);
    const popover = screen.getByRole("tooltip");
    expect(within(popover).getByText("3 findings in this run")).toBeInTheDocument();
    expect(within(popover).getByText("Finding w1")).toBeInTheDocument();
  });

  it("a settled run with an empty review keeps the plain count", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95, findings: [] })]);
    expect(findingsTrigger()).not.toBeInTheDocument();
    expect(screen.getByText("0 finding(s)")).toBeInTheDocument();
  });

  it("an unsettled run never shows icons, even if previews are present", () => {
    renderRuns([run({ status: "running", findings: [preview("c1", "CRITICAL")] })]);
    expect(findingsTrigger()).not.toBeInTheDocument();
  });
});
