/**
 * TabsView (AC-23): each tab shows the agent name and a coloured score ("—" when none), arrow
 * keys / Home / End move between tabs, and the tabpanel is labelled by the selected tab.
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import multiAgent from "../../../../../../../../../messages/en/multiAgent.json";
import type { RunColumn } from "../../types";

vi.mock("@/lib/hooks/reviews", () => ({ useRunEvents: () => ({ events: [], running: false }) }));
vi.mock("@/components/finding-card", () => ({
  FindingCard: ({ f }: { f: { title: string } }) => <div>finding:{f.title}</div>,
}));

import { TabsView } from "./TabsView";

afterEach(cleanup);

const col = (over: Partial<RunColumn>): RunColumn =>
  ({
    run_id: "run-x",
    agent_id: "x",
    agent_name: "X",
    status: "done",
    score: 80,
    summary: null,
    duration_ms: 1000,
    cost_usd: 0.1,
    error: null,
    findings: [],
    ...over,
  }) as RunColumn;

const COLUMNS = [
  col({
    run_id: "run-sec",
    agent_id: "sec",
    agent_name: "Security Reviewer",
    score: 85,
    summary: "Mostly safe.",
    findings: [{ id: "f1", title: "Hardcoded secret" }] as unknown as RunColumn["findings"],
  }),
  col({ run_id: "run-perf", agent_id: "perf", agent_name: "Performance Reviewer", score: 40, summary: "Slow." }),
  col({ run_id: "run-qa", agent_id: "qa", agent_name: "Quality Reviewer", status: "failed", score: 55, error: "Model unavailable" }),
  col({ run_id: "run-nos", agent_id: "nos", agent_name: "Docs Reviewer", score: null }),
];

function Harness({ onViewTrace = vi.fn(), columns = COLUMNS }: { onViewTrace?: (id: string) => void; columns?: RunColumn[] }) {
  const [tab, setTab] = React.useState<string | null>(null);
  return (
    <NextIntlClientProvider locale="en" messages={{ multiAgent }}>
      <TabsView
        columns={columns}
        tab={tab}
        onTabChange={setTab}
        prId="pr1"
        multiAgentRunId="m1"
        ranAt="2026-10-13T10:00:00.000Z"
        now={Date.parse("2026-10-13T10:00:05.000Z")}
        pendingFindingId={null}
        onSettled={() => {}}
        onViewTrace={onViewTrace}
        onFindingAction={() => {}}
      />
    </NextIntlClientProvider>
  );
}

const tabNamed = (name: RegExp) => screen.getByRole("tab", { name });

describe("TabsView", () => {
  it("shows one tab per agent with its name and score, a dash when there is none (or the run did not finish)", () => {
    render(<Harness />);

    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(tabNamed(/Security Reviewer/)).toHaveTextContent("85");
    expect(tabNamed(/Performance Reviewer/)).toHaveTextContent("40");
    // Failed run: its stored score is not shown; a done run without a score has none either.
    expect(tabNamed(/Quality Reviewer/)).toHaveTextContent("—");
    expect(tabNamed(/Quality Reviewer/)).not.toHaveTextContent("55");
    expect(tabNamed(/Docs Reviewer/)).toHaveTextContent("—");
  });

  it("selects the first agent, labels the panel by the selected tab and swaps the body on click", () => {
    const onViewTrace = vi.fn();
    render(<Harness onViewTrace={onViewTrace} />);

    const first = tabNamed(/Security Reviewer/);
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(tabNamed(/Performance Reviewer/)).toHaveAttribute("aria-selected", "false");
    expect(tabNamed(/Performance Reviewer/)).toHaveAttribute("tabindex", "-1");

    let panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", first.id);
    expect(first).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveTextContent("Mostly safe.");
    expect(screen.getByText("finding:Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("Slow.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("View trace"));
    expect(onViewTrace).toHaveBeenCalledWith("run-sec");

    fireEvent.click(tabNamed(/Performance Reviewer/));
    panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", tabNamed(/Performance Reviewer/).id);
    expect(panel).toHaveTextContent("Slow.");
    expect(screen.getByText("No findings.")).toBeInTheDocument();
    expect(screen.queryByText("finding:Hardcoded secret")).not.toBeInTheDocument();
  });

  it("shows the failure reason and keeps View trace on a failed agent's tab", () => {
    render(<Harness />);
    fireEvent.click(tabNamed(/Quality Reviewer/));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Model unavailable");
    expect(screen.getByText("View trace")).toBeInTheDocument();
  });

  it("moves between tabs with arrow keys (wrapping), Home and End, and moves focus with the selection", () => {
    render(<Harness />);
    const press = (key: string) => {
      const current = screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")!;
      fireEvent.keyDown(current, { key });
    };
    const selected = () => screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")!;

    press("ArrowRight");
    expect(selected()).toHaveTextContent("Performance Reviewer");
    expect(selected()).toHaveFocus();

    press("End");
    expect(selected()).toHaveTextContent("Docs Reviewer");
    expect(selected()).toHaveFocus();

    press("ArrowRight"); // wraps to the first
    expect(selected()).toHaveTextContent("Security Reviewer");

    press("ArrowLeft"); // wraps to the last
    expect(selected()).toHaveTextContent("Docs Reviewer");

    press("Home");
    expect(selected()).toHaveTextContent("Security Reviewer");

    press("a"); // unrelated keys do nothing
    expect(selected()).toHaveTextContent("Security Reviewer");
  });

  it("renders nothing for a run without columns", () => {
    render(<Harness columns={[]} />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});
