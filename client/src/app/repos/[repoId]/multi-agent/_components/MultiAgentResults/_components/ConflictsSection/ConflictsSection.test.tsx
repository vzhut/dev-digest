/**
 * ConflictsSection (AC-20/21): one card per location, "did not flag" cells carry no note,
 * failed / cancelled / pending markers, the "Show only conflicts" filter on is_conflict,
 * the counter wording and the empty states.
 */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import multiAgent from "../../../../../../../../../messages/en/multiAgent.json";
import type { RunColumn, RunConflict } from "../../types";
import { ConflictsSection } from "./ConflictsSection";

afterEach(cleanup);

const columns = [
  { agent_id: "sec", agent_name: "Security Reviewer" },
  { agent_id: "perf", agent_name: "Performance Reviewer" },
  { agent_id: "qa", agent_name: "Quality Reviewer" },
] as RunColumn[];

const conflicts = [
  {
    file: "src/db.ts",
    line: 10,
    end_line: 12,
    title: "SQL built from user input",
    is_conflict: true,
    members: [],
    takes: [
      { agent_id: "sec", persona: "Security", verdict: "CRITICAL", note: "Unsanitised query string" },
      { agent_id: "perf", persona: "Performance", verdict: "ignored", note: "ignored-note-must-not-show" },
      { agent_id: "qa", persona: "Quality", verdict: "failed", note: "" },
    ],
  },
  {
    file: "src/api.ts",
    line: 5,
    end_line: 5,
    title: "Missing retry",
    is_conflict: false,
    members: [],
    takes: [
      { agent_id: "sec", persona: "Security", verdict: "WARNING", note: "Retry would help" },
      { agent_id: "perf", persona: "Performance", verdict: "cancelled", note: "" },
      { agent_id: "qa", persona: "Quality", verdict: "pending", note: "" },
    ],
  },
  {
    file: "src/ui.ts",
    line: 1,
    end_line: 2,
    title: "Odd name",
    is_conflict: false,
    members: [],
    takes: [{ agent_id: "ghost", persona: "Ghost Persona", verdict: "SUGGESTION", note: "n" }],
  },
] as RunConflict[];

function Harness({ list, initial = false }: { list: RunConflict[]; initial?: boolean }) {
  const [only, setOnly] = React.useState(initial);
  return (
    <NextIntlClientProvider locale="en" messages={{ multiAgent }}>
      <ConflictsSection conflicts={list} columns={columns} onlyConflicts={only} onToggleOnly={setOnly} />
    </NextIntlClientProvider>
  );
}

describe("ConflictsSection", () => {
  it("renders one card per location with per-agent takes and no note on non-flagging cells", () => {
    render(<Harness list={conflicts} />);

    expect(screen.getByText("src/db.ts:10-12")).toBeInTheDocument();
    expect(screen.getByText("src/api.ts:5")).toBeInTheDocument();
    expect(screen.getByText("src/ui.ts:1-2")).toBeInTheDocument();
    expect(screen.getByText("SQL built from user input")).toBeInTheDocument();

    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("WARNING")).toBeInTheDocument();
    expect(screen.getByText("Retry would help")).toBeInTheDocument();
    expect(screen.getByText("Unsanitised query string")).toBeInTheDocument();
    expect(screen.getByText("did not flag")).toBeInTheDocument();
    expect(screen.queryByText("ignored-note-must-not-show")).not.toBeInTheDocument();
    expect(screen.getByText("run failed")).toBeInTheDocument();
    expect(screen.getByText("run cancelled")).toBeInTheDocument();
    expect(screen.getByText("still running")).toBeInTheDocument();
    // Agent names come from the run's columns; an unknown agent falls back to the persona.
    expect(screen.getAllByText("Security Reviewer")).toHaveLength(2);
    expect(screen.getByText("Ghost Persona")).toBeInTheDocument();
  });

  it("counts disagreements when the filter is off and filters + recounts when it is on", () => {
    render(<Harness list={conflicts} />);

    expect(screen.getByText("1 of 3 locations disagree")).toBeInTheDocument();
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Showing 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("src/db.ts:10-12")).toBeInTheDocument();
    expect(screen.queryByText("src/api.ts:5")).not.toBeInTheDocument();
    expect(screen.queryByText("src/ui.ts:1-2")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText("src/api.ts:5")).toBeInTheDocument();
  });

  it("uses the singular 'location' for a single location", () => {
    render(<Harness list={[conflicts[0]!]} />);
    expect(screen.getByText("1 of 1 location disagree")).toBeInTheDocument();
  });

  it("shows the 'no overlap' message and no counter when there are no locations", () => {
    render(<Harness list={[]} />);
    expect(screen.getByText("No overlapping findings between agents.")).toBeInTheDocument();
    expect(screen.queryByText(/of \d+ locations? disagree/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("shows the 'agents agree' message when the filter hides every location", () => {
    render(<Harness list={[conflicts[1]!, conflicts[2]!]} initial />);
    expect(screen.getByText("No conflicts: the agents agree wherever they overlap.")).toBeInTheDocument();
    expect(screen.getByText("Showing 0 of 2")).toBeInTheDocument();
  });
});
