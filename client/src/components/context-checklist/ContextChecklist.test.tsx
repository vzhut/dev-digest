/**
 * ContextChecklist — attach/detach/reorder project docs. Load-bearing rules: the
 * estimate is the exact sum of ticked rows' listed tokens, inherited rows are
 * read-only and uncounted, an attached-but-missing row stays visible so it can be detached.
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDoc } from "@devdigest/shared";
import messages from "../../../messages/en/context.json";
import { buildChecklistRows, toPaths, type ChecklistRow } from "@/lib/context-docs";
import { ContextChecklist, type ContextChecklistProps } from "./ContextChecklist";

afterEach(cleanup);

const doc = (path: string, type: ContextDoc["type"], tokens: number): ContextDoc => ({
  path,
  type,
  size_bytes: tokens * 4,
  tokens,
  updated_at: "2026-10-01T00:00:00.000Z",
  used_by_agents: 0,
});

const DOCS = [
  doc("specs/a.md", "specs", 100),
  doc("specs/b.md", "specs", 250),
  doc("docs/guide.md", "docs", 40),
  doc("docs/skill-doc.md", "docs", 7),
];

function Harness({
  attached,
  inherited = [],
  onRows,
  ...rest
}: {
  attached: string[];
  inherited?: { skill_id: string; skill_name: string; paths: string[] }[];
  onRows?: (rows: ChecklistRow[]) => void;
} & Partial<ContextChecklistProps>) {
  const [rows, setRows] = React.useState(() => buildChecklistRows(DOCS, attached, inherited));
  return (
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextChecklist
        rows={rows}
        roots={["docs/**", "specs/**"]}
        onPreview={vi.fn()}
        {...rest}
        onChange={(r) => {
          setRows(r);
          onRows?.(r);
        }}
      />
    </NextIntlClientProvider>
  );
}

const box = (path: string) => screen.getByRole("checkbox", { name: `Attach ${path}` });

describe("ContextChecklist", () => {
  it("lists rows, filters by substring, and ticking updates the count and the exact token estimate", () => {
    render(<Harness attached={["specs/a.md"]} />);
    expect(screen.getByText("1 of 4 attached")).toBeInTheDocument();
    expect(screen.getByText("Estimated context: 100 tokens")).toBeInTheDocument();
    expect(screen.getAllByText("specs").length).toBeGreaterThan(0); // type tag as text

    fireEvent.click(box("specs/b.md"));
    fireEvent.click(box("docs/guide.md"));
    expect(screen.getByText("3 of 4 attached")).toBeInTheDocument();
    expect(screen.getByText("Estimated context: 390 tokens")).toBeInTheDocument(); // 100 + 250 + 40

    fireEvent.change(screen.getByRole("textbox", { name: /filter/i }), { target: { value: "GUIDE" } });
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
    expect(screen.queryByText("specs/a.md")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /filter/i }), { target: { value: "zzz" } });
    expect(screen.getByText("No documents match the filter")).toBeInTheDocument();
  });

  it("shows inherited rows read-only and uncounted, and disables non-attachable rows", () => {
    render(
      <Harness
        attached={[]}
        inherited={[{ skill_id: "s1", skill_name: "Security", paths: ["docs/skill-doc.md"] }]}
      />,
    );
    expect(screen.getByText("via Security")).toBeInTheDocument();
    const inheritedRow = screen.getByText("via Security").closest("li")!;
    expect(within(inheritedRow).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText("0 of 4 attached")).toBeInTheDocument();
    expect(screen.getByText("Estimated context: 0 tokens")).toBeInTheDocument();
  });

  it("disables a listed path that cannot be attached", () => {
    const rows = buildChecklistRows([doc("docs/a\\b.md", "docs", 3)], []);
    render(
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ContextChecklist rows={rows} roots={[]} onChange={vi.fn()} onPreview={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("keeps an attached missing row visible and removes it when unticked", () => {
    let last: ChecklistRow[] = [];
    render(<Harness attached={["specs/gone.md", "specs/a.md"]} onRows={(r) => (last = r)} />);
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("Estimated context: 100 tokens")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview specs/gone.md" })).not.toBeInTheDocument();

    fireEvent.click(box("specs/gone.md"));
    expect(screen.queryByText("specs/gone.md")).not.toBeInTheDocument();
    expect(toPaths(last)).toEqual(["specs/a.md"]);
  });

  it("toggles via the checkbox and reorders with move up; order is what gets saved", () => {
    let last: ChecklistRow[] = [];
    render(<Harness attached={["specs/a.md"]} onRows={(r) => (last = r)} />);
    fireEvent.click(box("specs/b.md"));
    expect(toPaths(last)).toEqual(["specs/a.md", "specs/b.md"]);

    fireEvent.click(screen.getByRole("button", { name: "Move specs/b.md up" }));
    expect(toPaths(last)).toEqual(["specs/b.md", "specs/a.md"]);
    expect(screen.queryByRole("button", { name: "Move specs/b.md up" })).not.toBeInTheDocument();

    fireEvent.click(box("specs/b.md"));
    expect(toPaths(last)).toEqual(["specs/a.md"]);
  });

  it("calls onPreview with the row path", () => {
    const onPreview = vi.fn();
    render(<Harness attached={[]} onPreview={onPreview} />);
    fireEvent.click(screen.getByRole("button", { name: "Preview docs/guide.md" }));
    expect(onPreview).toHaveBeenCalledWith("docs/guide.md");
  });

  it("renders loading, error-with-retry and empty-naming-roots states", () => {
    const onRetry = vi.fn();
    const wrap = (p: Partial<ContextChecklistProps>) => (
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ContextChecklist rows={[]} roots={["docs/**"]} onChange={vi.fn()} onPreview={vi.fn()} {...p} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(wrap({ isLoading: true }));
    expect(screen.getByRole("status", { name: "Loading documents" })).toBeInTheDocument();

    rerender(wrap({ isError: true, onRetry }));
    const alert = screen.getByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();

    rerender(wrap({}));
    expect(screen.getByText("Nothing matches the search roots: docs/**")).toBeInTheDocument();
  });
});
