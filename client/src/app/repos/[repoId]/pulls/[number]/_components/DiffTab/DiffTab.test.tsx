import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { DiffTab } from "./DiffTab";

const state: { smart: SmartDiff | undefined; reviews: ReviewRecord[] } = { smart: undefined, reviews: [] };
const mutate = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSmartDiff: () => ({ data: state.smart }),
  usePrReviews: () => ({ data: state.reviews }),
  useFindingAction: () => ({ isPending: false, mutate }),
}));

afterEach(cleanup);
beforeEach(() => {
  state.reviews = [];
  mutate.mockClear();
  state.smart = {
    groups: [
      { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 1, deletions: 0, finding_lines: [] }] },
      { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, finding_lines: [] }] },
      { role: "tests", files: [{ path: "a.test.ts", additions: 1, deletions: 0, finding_lines: [] }] },
      { role: "core", files: [{ path: "src/a.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    ],
    split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
  };
});

const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: null });
const patched = (path: string): PrFile => ({
  path,
  additions: 1,
  deletions: 0,
  patch: "@@ -0,0 +1,2 @@\n+const alpha = 1;\n+const beta = 2;",
});
const finding = (over: Partial<FindingRecord>): FindingRecord => ({
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded key",
  file: "src/a.ts",
  start_line: 2,
  end_line: 2,
  rationale: "Because.",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
  ...over,
} as FindingRecord);
const review = (findings: FindingRecord[]): ReviewRecord => ({ id: "r1", kind: "review", findings } as ReviewRecord);
// pr.files order intentionally differs from the smart order.
const FILES = [file("pnpm-lock.yaml"), file("README.md"), file("a.test.ts"), file("src/a.ts")];

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <DiffTab prId="p1" filesCount={4} files={FILES} />
    </NextIntlClientProvider>,
  );
}

describe("DiffTab smart grouping", () => {
  it("groups by role in order, collapses docs/boilerplate, and toggles to original order", () => {
    renderTab();
    const headers = screen.getAllByRole("button", { expanded: true }).concat(screen.getAllByRole("button", { expanded: false }));
    expect(headers.map((h) => h.textContent)).toEqual(
      expect.arrayContaining(["Core1 file", "Tests1 file", "Docs1 file", "Boilerplate1 file"]),
    );
    const order = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded")).map((b) => b.textContent);
    expect(order).toEqual(["Core1 file", "Tests1 file", "Docs1 file", "Boilerplate1 file"]);

    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText("a.test.ts")).toBeInTheDocument();
    expect(screen.queryByText("README.md")).not.toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Docs/ }));
    expect(screen.getByText("README.md")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.queryByRole("button", { name: /1 file/ })).not.toBeInTheDocument();
    const paths = ["pnpm-lock.yaml", "README.md", "a.test.ts", "src/a.ts"].map((p) => screen.getByText(p));
    for (let i = 0; i < paths.length - 1; i++) {
      expect(paths[i]!.compareDocumentPosition(paths[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("renders the original order without headers while smart-diff has not loaded", () => {
    state.smart = undefined;
    renderTab();
    expect(screen.queryByRole("button", { name: /1 file/ })).not.toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
  });
});

describe("DiffTab inline findings", () => {
  it("shows dots + counts, anchors cards on lines, hides them with the toggle, and acts on them", () => {
    state.reviews = [
      review([
        finding({ id: "f1", start_line: 2, title: "Hardcoded key" }),
        finding({ id: "f2", start_line: 40, severity: "WARNING", title: "Off-patch issue", dismissed_at: "2026-01-01" }),
      ]),
    ];
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="p1" filesCount={1} files={[patched("src/a.ts")]} />
      </NextIntlClientProvider>,
    );
    // Group header: dot + count of FILES (2 findings, 1 file); file dot has no number.
    expect(screen.getByTitle("1 file with findings")).toHaveTextContent("1");
    expect(screen.getAllByRole("img", { name: "Has review findings" })).toHaveLength(1);

    // Hidden by default, like comments.
    expect(screen.queryByText("Hardcoded key")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Comments and findings (2)" }));
    expect(screen.getByText("Hardcoded key")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    // Off-patch (and dismissed) finding lands in the end-of-file block.
    expect(screen.getByText("Findings outside the changed lines (1)")).toBeInTheDocument();
    expect(screen.getByText("Off-patch issue")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[0]!);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ findingId: "f1", action: "dismiss", prId: "p1" }));

    fireEvent.click(screen.getByRole("button", { name: "Comments and findings (2)" }));
    expect(screen.queryByText("Hardcoded key")).not.toBeInTheDocument();
  });

  it("tells the user when no review has run yet", () => {
    state.reviews = [];
    renderTab();
    expect(screen.getByText(/No review has run on this PR yet/)).toBeInTheDocument();
  });
});
