import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "style",
  rule: "Use async/await, not .then()",
  edited: false,
  evidence_path: "src/api/users.ts",
  evidence_line_start: 23,
  evidence_line_end: 31,
  evidence_snippet: "await db.query(...)",
  evidence_url: "https://github.com/acme/api/blob/sha/src/api/users.ts#L23-L31",
  confidence: 0.9,
  status: "pending",
};

const wrap = (ui: React.ReactElement) =>
  render(<NextIntlClientProvider locale="en" messages={{ conventions: messages }}>{ui}</NextIntlClientProvider>);

const noop = () => {};

describe("ConventionCard", () => {
  it("shows the rule, evidence link href, snippet, and confidence", () => {
    wrap(<ConventionCard candidate={CANDIDATE} onAccept={noop} onReject={noop} onUndo={noop} onSaveRule={noop} />);
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toHaveAttribute("href", CANDIDATE.evidence_url);
    expect(screen.getByText("await db.query(...)")).toBeInTheDocument();
    expect(screen.getByText("90% confidence")).toBeInTheDocument();
  });

  it("fires onAccept / onReject from the labelled buttons", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    wrap(<ConventionCard candidate={CANDIDATE} onAccept={onAccept} onReject={onReject} onUndo={noop} onSaveRule={noop} />);
    fireEvent.click(screen.getByText("Accept"));
    fireEvent.click(screen.getByText("Reject"));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("Edit switches to an inline field; Enter saves a changed, non-empty rule", () => {
    const onSaveRule = vi.fn();
    wrap(<ConventionCard candidate={CANDIDATE} onAccept={noop} onReject={noop} onUndo={noop} onSaveRule={onSaveRule} />);
    fireEvent.click(screen.getByText("Edit"));
    const input = screen.getByDisplayValue(CANDIDATE.rule);
    fireEvent.change(input, { target: { value: "Always use async/await" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSaveRule).toHaveBeenCalledWith("Always use async/await");
    expect(screen.queryByDisplayValue("Always use async/await")).toBeNull(); // back to display mode
  });

  it("Esc cancels the edit without calling onSaveRule", () => {
    const onSaveRule = vi.fn();
    wrap(<ConventionCard candidate={CANDIDATE} onAccept={noop} onReject={noop} onUndo={noop} onSaveRule={onSaveRule} />);
    fireEvent.click(screen.getByText("Edit"));
    const input = screen.getByDisplayValue(CANDIDATE.rule);
    fireEvent.change(input, { target: { value: "Something else entirely" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSaveRule).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });

  it("shows the edited chip once edited is true", () => {
    wrap(
      <ConventionCard
        candidate={{ ...CANDIDATE, edited: true }}
        onAccept={noop}
        onReject={noop}
        onUndo={noop}
        onSaveRule={noop}
      />,
    );
    expect(screen.getByText("edited")).toBeInTheDocument();
  });

  it("a rejected candidate collapses to one line with Undo", () => {
    const onUndo = vi.fn();
    wrap(
      <ConventionCard
        candidate={{ ...CANDIDATE, status: "rejected" }}
        onAccept={noop}
        onReject={noop}
        onUndo={onUndo}
        onSaveRule={noop}
      />,
    );
    expect(screen.queryByText("Accept")).toBeNull();
    expect(screen.queryByText(CANDIDATE.evidence_path, { exact: false })).toBeNull();
    fireEvent.click(screen.getByText("Undo"));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
