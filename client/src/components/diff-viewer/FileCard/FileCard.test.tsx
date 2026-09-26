import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import shell from "../../../../messages/en/shell.json";
import prReview from "../../../../messages/en/prReview.json";
import type { DiffFindingApi } from "../findings";
import { FileCard } from "./FileCard";

afterEach(cleanup);

// New-file lines 1..3 are rendered as RIGHT:1..RIGHT:3.
const FILE: PrFile = {
  path: "src/a.ts",
  additions: 3,
  deletions: 0,
  patch: "@@ -0,0 +1,3 @@\n+const alpha = 1;\n+const beta = 2;\n+const gamma = 3;",
};

const finding = (id: string, severity: string, start_line: number): FindingRecord =>
  ({ id, severity, start_line, end_line: start_line, file: "src/a.ts", title: `title-${id}` }) as FindingRecord;

function api(list: FindingRecord[], show = true): DiffFindingApi {
  return {
    byFile: { "src/a.ts": list },
    show,
    FindingView: ({ finding: f }) => <div data-testid={`fv-${f.id}`}>{f.title}</div>,
  };
}

function renderCard(findings: DiffFindingApi) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <FileCard file={FILE} findings={findings} />
    </NextIntlClientProvider>,
  );
}

describe("FileCard inline findings", () => {
  it("renders a finding under the line matching RIGHT:start_line and off-patch ones in the outside block", () => {
    renderCard(api([finding("in", "WARNING", 2), finding("out", "WARNING", 40)]));

    const betaRow = screen.getByText("const beta = 2;");
    const inView = screen.getByTestId("fv-in");
    // The card follows line 2 and precedes line 3.
    expect(betaRow.compareDocumentPosition(inView) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(inView.compareDocumentPosition(screen.getByText("const gamma = 3;")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("const alpha = 1;").compareDocumentPosition(inView) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Line 40 is not in the patch: only in the end-of-file block.
    const outside = screen.getByText("Findings outside the changed lines (1)");
    const outView = screen.getByTestId("fv-out");
    expect(outside.compareDocumentPosition(outView) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByTestId(/^fv-/)).toHaveLength(2);
  });

  it("shows a digit-free finding dot that stays visible when show=false while the cards hide", () => {
    renderCard(api([finding("in", "CRITICAL", 2), finding("out", "WARNING", 40)], false));

    const dot = screen.getByRole("img", { name: "Has review findings" });
    expect(dot).toBeVisible();
    expect(dot).toHaveTextContent("");
    expect(screen.queryByTestId("fv-in")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fv-out")).not.toBeInTheDocument();
    expect(screen.queryByText(/Findings outside the changed lines/)).not.toBeInTheDocument();
  });

  it.each([
    ["CRITICAL", "blocker", "var(--crit)"],
    ["WARNING", "warning", "var(--warn)"],
    ["SUGGESTION", "suggestion", "var(--sugg)"],
  ])("marks a %s line with a %s label and a severity stripe", (severity, label, color) => {
    renderCard(api([finding("x", severity, 2)]));

    expect(screen.getByText(label)).toBeInTheDocument();
    const row = screen.getByText("const beta = 2;").parentElement!;
    expect(row.style.borderLeftColor).toBe(color);
    // Unflagged lines get no stripe.
    expect(screen.getByText("const alpha = 1;").parentElement!.style.borderLeftColor).toBe("");
  });
});
