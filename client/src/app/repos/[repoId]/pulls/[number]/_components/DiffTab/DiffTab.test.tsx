import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { DiffTab } from "./DiffTab";
import type { DiffTarget } from "@/components/diff-viewer";

const state: { smart: SmartDiff | undefined; reviews: ReviewRecord[] } = { smart: undefined, reviews: [] };
const mutate = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSmartDiff: () => ({ data: state.smart }),
  usePrReviews: () => ({ data: state.reviews }),
  useFindingAction: () => ({ isPending: false, mutate }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  // the FindingCard's eval-case action reads the PR's case links: stub the network edge only
  vi.spyOn(api, "getEvalCaseLinks").mockResolvedValue([]);
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
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <DiffTab prId="p1" filesCount={4} files={FILES} />
    </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("DiffTab smart grouping", () => {
  it("groups by role in order, collapses docs/boilerplate, and toggles to original order", () => {
    renderTab();
    const headers = screen.getAllByRole("button", { expanded: true }).concat(screen.getAllByRole("button", { expanded: false }));
    expect(headers.map((h) => h.textContent)).toEqual(
      expect.arrayContaining([
        "CoreThe substance of the change — review closely1 file",
        "TestsVerifies the change1 file",
        "DocsExplains the change1 file",
        "BoilerplateGenerated / mechanical — skim1 file",
      ]),
    );
    const order = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded")).map((b) => b.textContent);
    expect(order).toEqual([
      "CoreThe substance of the change — review closely1 file",
      "TestsVerifies the change1 file",
      "DocsExplains the change1 file",
      "BoilerplateGenerated / mechanical — skim1 file",
    ]);

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
      <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="p1" filesCount={1} files={[patched("src/a.ts")]} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
    );
    // Group header: dot + count of FILES (2 findings, 1 file); file dot has no number.
    expect(screen.getByTitle("1 file with findings")).toHaveTextContent("1");
    expect(screen.getAllByRole("img", { name: "Has review findings" })).toHaveLength(1);

    // Visible by default (comments stay hidden).
    expect(screen.getByRole("button", { name: "Comments and findings (2)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Hardcoded key")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    // Off-patch (and dismissed) finding lands in the end-of-file block.
    expect(screen.getByText("Findings outside the changed lines (1)")).toBeInTheDocument();
    expect(screen.getByText("Off-patch issue")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[0]!);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ findingId: "f1", action: "dismiss", prId: "p1" }));

    fireEvent.click(screen.getByRole("button", { name: "Comments and findings (2)" }));
    expect(screen.queryByText("Hardcoded key")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comments and findings (2)" })).toHaveAttribute("aria-pressed", "false");

    // Second click shows them again.
    fireEvent.click(screen.getByRole("button", { name: "Comments and findings (2)" }));
    expect(screen.getByText("Hardcoded key")).toBeInTheDocument();
  });

  it("calls the finding action with accept when the user accepts an inline finding", () => {
    state.reviews = [review([finding({ id: "f1", start_line: 2, title: "Hardcoded key" })])];
    render(
      <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="p1" filesCount={1} files={[patched("src/a.ts")]} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ findingId: "f1", action: "accept", prId: "p1" }));
  });

  it("pluralises the file count in the group header", () => {
    state.smart = {
      groups: [
        { role: "core", files: [
          { path: "src/a.ts", additions: 1, deletions: 0, finding_lines: [] },
          { path: "src/b.ts", additions: 1, deletions: 0, finding_lines: [] },
        ] },
        { role: "tests", files: [{ path: "a.test.ts", additions: 1, deletions: 0, finding_lines: [] }] },
      ],
      split_suggestion: { too_big: false, total_lines: 3, proposed_splits: [] },
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="p1" filesCount={3} files={[file("src/a.ts"), file("src/b.ts"), file("a.test.ts")]} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
    );
    expect(screen.getByRole("button", { name: /Core.*2 files$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tests.*1 file$/ })).toBeInTheDocument();
    expect(screen.getByText("The substance of the change — review closely")).toBeInTheDocument();
    expect(screen.getByText("Verifies the change")).toBeInTheDocument();
    expect(screen.getAllByTestId("group-square")).toHaveLength(2);
  });

  it("tells the user when no review has run yet", () => {
    state.reviews = [];
    renderTab();
    expect(screen.getByText(/No review has run on this PR yet/)).toBeInTheDocument();
  });
});

describe("DiffTab deep-link target", () => {
  const scrollIntoView = vi.fn();
  beforeEach(() => {
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  function renderTarget(target: DiffTarget, files: PrFile[]) {
    return render(
      <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="p1" filesCount={files.length} files={files} target={target} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
    );
  }

  it("opens a collapsed group, scrolls to and highlights the target row", () => {
    // README.md lives in the collapsed "docs" group.
    renderTarget({ file: "README.md", line: 2 }, [patched("README.md"), patched("src/a.ts")]);
    // The docs group is collapsed by default; the target forces it open.
    expect(screen.getByText("README.md")).toBeInTheDocument();
    const rows = document.querySelectorAll('[aria-current="location"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("const beta = 2;");
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a status note when the line is outside the changed hunks or the file has no patch", () => {
    const { unmount } = renderTarget({ file: "src/a.ts", line: 40 }, [patched("src/a.ts")]);
    expect(screen.getByRole("status")).toHaveTextContent("Line 40 is outside the changed hunks.");
    expect(document.querySelector('[aria-current="location"]')).toBeNull();
    expect(scrollIntoView).toHaveBeenCalled();
    unmount();

    renderTarget({ file: "src/a.ts", line: 3 }, [file("src/a.ts")]);
    expect(screen.getByRole("status")).toHaveTextContent("Line 3 is outside the changed hunks.");
  });

  it("does not re-open a card the user collapsed when the parent re-renders an equal target", () => {
    const files = [patched("src/a.ts")];
    const ui = (target: DiffTarget) => (
      <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="p1" filesCount={files.length} files={files} target={target} />
      </NextIntlClientProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(ui({ file: "src/a.ts", line: 2 }));
    expect(document.querySelector('[aria-current="location"]')).not.toBeNull();

    // Collapse the card by its header.
    fireEvent.click(screen.getByText("src/a.ts"));
    expect(document.querySelector('[aria-current="location"]')).toBeNull();

    // A new object with the same file and line, as a re-rendering parent builds it.
    rerender(ui({ file: "src/a.ts", line: 2 }));
    expect(document.querySelector('[aria-current="location"]')).toBeNull();
  });

  it("still opens and highlights the target in original order", () => {
    const { rerender } = renderTarget({ file: "README.md", line: 1 }, [patched("README.md"), patched("src/a.ts")]);
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.queryByRole("button", { name: /1 file/ })).not.toBeInTheDocument();
    expect(document.querySelector('[aria-current="location"]')).toHaveTextContent("const alpha = 1;");
    rerender(
      <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="p1" filesCount={2} files={[patched("README.md"), patched("src/a.ts")]} target={{ file: "README.md", line: 1 }} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
    );
    expect(document.querySelectorAll('[aria-current="location"]')).toHaveLength(1);
  });
});
