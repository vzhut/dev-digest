/**
 * AgentColumn (AC-22/33): done / running / queued / failed / cancelled states. Failed and
 * cancelled show the error or "Cancelled" and no score ring; "No findings." for an empty
 * done run; View trace is always present.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import multiAgent from "../../../../../../../../../../../messages/en/multiAgent.json";
import type { RunColumn } from "../../../../types";

const state: { events: { t: string; kind: string; msg: string }[] } = { events: [] };
const useRunEvents = vi.fn((_ids: string[], _opts?: unknown) => ({ events: state.events, running: false }));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: (ids: string[], opts?: unknown) => useRunEvents(ids, opts),
}));

import { AgentColumn } from "./AgentColumn";

beforeEach(() => {
  state.events = [];
  useRunEvents.mockClear();
});
afterEach(cleanup);

const RAN_AT = "2026-10-13T10:00:00.000Z";
const NOW = Date.parse(RAN_AT) + 3000;

const finding = (id: string, title: string, file: string, start: number, end: number, severity = "WARNING") => ({
  id,
  title,
  file,
  start_line: start,
  end_line: end,
  severity,
});

const column = (over: Partial<RunColumn> = {}): RunColumn =>
  ({
    run_id: "run-1",
    agent_id: "sec",
    agent_name: "Security Reviewer",
    provider: "openai",
    model: "gpt-4.1",
    status: "done",
    verdict: null,
    score: 85,
    summary: null,
    duration_ms: 8200,
    cost_usd: 0.1,
    error: null,
    findings: [],
    ...over,
  }) as RunColumn;

function renderColumn(c: RunColumn, onViewTrace = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent }}>
      <AgentColumn column={c} ranAt={RAN_AT} now={NOW} onSettled={() => {}} onViewTrace={onViewTrace} />
    </NextIntlClientProvider>,
  );
  return onViewTrace;
}

describe("AgentColumn", () => {
  it("done: name, time · cost, score ring, finding cards with file:range, count, View trace", () => {
    const onViewTrace = renderColumn(
      column({
        findings: [
          finding("f1", "Hardcoded secret", "src/a.ts", 3, 5, "CRITICAL"),
          finding("f2", "Slow loop", "src/b.ts", 9, 9),
        ] as unknown as RunColumn["findings"],
      }),
    );

    expect(screen.getByRole("region", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("8.2s · $0.10")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:3-5")).toBeInTheDocument();
    expect(screen.getByText("src/b.ts:9")).toBeInTheDocument();
    expect(screen.getByText("2 findings")).toBeInTheDocument();
    expect(screen.queryByText("No findings.")).not.toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    // A settled run opens no event stream.
    expect(useRunEvents).toHaveBeenCalledWith([], expect.anything());

    fireEvent.click(screen.getByText("View trace"));
    expect(onViewTrace).toHaveBeenCalledWith("run-1");
  });

  it("done with zero findings says 'No findings.' and counts 0", () => {
    renderColumn(column({ findings: [] }));
    expect(screen.getByText("No findings.")).toBeInTheDocument();
    expect(screen.getByText("0 findings")).toBeInTheDocument();
    expect(screen.getByText("View trace")).toBeInTheDocument();
  });

  it("failed: shows the error and a failed tag, no score ring, and still offers View trace", () => {
    renderColumn(column({ status: "failed", error: "Provider timed out", score: 40 }));
    expect(screen.getByText("Provider timed out")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.queryByText("40")).not.toBeInTheDocument();
    expect(screen.queryByText("No findings.")).not.toBeInTheDocument();
    expect(screen.getByText("View trace")).toBeInTheDocument();
  });

  it("failed without a reason falls back to a generic line", () => {
    renderColumn(column({ status: "failed", error: null }));
    expect(screen.getByText("The run failed.")).toBeInTheDocument();
  });

  it("cancelled: shows 'Cancelled', a cancelled tag and no score ring", () => {
    renderColumn(column({ status: "cancelled", error: "ignored", score: 70 }));
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("cancelled")).toBeInTheDocument();
    expect(screen.queryByText("ignored")).not.toBeInTheDocument();
    expect(screen.queryByText("70")).not.toBeInTheDocument();
    expect(screen.getByText("View trace")).toBeInTheDocument();
  });

  it("running child shows queued until its first event, then running, with elapsed time", () => {
    const live = column({ status: "running", score: null, duration_ms: null, cost_usd: null });
    renderColumn(live);
    expect(screen.getByText("queued")).toBeInTheDocument();
    // Elapsed = now - ran_at (3s), cost unknown while running.
    expect(screen.getByText("3.0s · unknown")).toBeInTheDocument();
    expect(useRunEvents).toHaveBeenCalledWith(["run-1"], expect.anything());
    expect(screen.getByText("View trace")).toBeInTheDocument();
    expect(screen.queryByText("No findings.")).not.toBeInTheDocument();

    cleanup();
    state.events = [{ t: "00.10", kind: "info", msg: "Starting review" }];
    renderColumn(live);
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.queryByText("queued")).not.toBeInTheDocument();
  });
});
