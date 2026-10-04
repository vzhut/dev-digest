import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefResponse } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

// Real brief hooks are replaced so the real PrBriefCard can be driven through its states.
const briefQuery = vi.fn();
const genState = { isPending: false, isError: false, error: null as unknown };
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ refetch: vi.fn(), ...briefQuery() }),
  useGeneratePrBrief: () => ({ mutate: vi.fn(), ...genState }),
}));

// The first test uses a light stub of the brief card; the state tests flip this to the real one.
const useReal = { current: false };

vi.mock("../PrBriefCard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../PrBriefCard")>();
  return { ...actual, PrBriefCard: (p: React.ComponentProps<typeof actual.PrBriefCard>) =>
    useReal.current ? <actual.PrBriefCard {...p} /> : <StubBrief {...p} /> };
});

function StubBrief(p: {
    intent: (risks: React.ReactNode) => React.ReactNode;
    blast: React.ReactNode;
    diffPaths: string[];
    filesCount: number;
    onOpenInDiff: (f: string, l: number) => void;
  }) {
  return (
    <section aria-label="brief" data-paths={p.diffPaths.join(",")} data-files={p.filesCount}>
      <button onClick={() => p.onOpenInDiff("src/a.ts", 4)}>open</button>
      {p.intent(null)}
      {p.blast}
    </section>
  );
}
vi.mock("../IntentCard", () => ({ IntentCard: () => <div>intent-card</div> }));
vi.mock("../BlastRadiusCard", () => ({ BlastRadiusCard: () => <div>blast-card</div> }));
vi.mock("../PriorPrsCard", () => ({ PriorPrsCard: () => <div>prior-card</div> }));

import { OverviewTab } from "./OverviewTab";

afterEach(() => {
  cleanup();
  useReal.current = false;
  genState.isPending = false;
  genState.isError = false;
  genState.error = null;
});

function renderTab(onOpenInDiff = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, brief: briefMessages }}>
      <OverviewTab
        prId="pr-1"
        prBody="The PR description"
        repoId="r1"
        repoFullName="o/r"
        baseRef="main"
        diffPaths={["src/a.ts", "src/b.ts"]}
        filesCount={2}
        latestReview={null}
        onOpenInDiff={onOpenInDiff}
      />
    </NextIntlClientProvider>,
  );
  return onOpenInDiff;
}

describe("OverviewTab", () => {
  it("renders the brief first with Intent and Blast inside it, then prior PRs, then the description", () => {
    const onOpen = renderTab();
    const brief = screen.getByRole("region", { name: "brief" });
    expect(brief).toHaveTextContent("intent-card");
    expect(brief).toHaveTextContent("blast-card");
    expect(brief).toHaveAttribute("data-paths", "src/a.ts,src/b.ts");
    expect(brief).toHaveAttribute("data-files", "2");

    const prior = screen.getByText("prior-card");
    const desc = screen.getByText("The PR description");
    expect(brief.compareDocumentPosition(prior) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(prior.compareDocumentPosition(desc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    screen.getByRole("button", { name: "open" }).click();
    expect(onOpen).toHaveBeenCalledWith("src/a.ts", 4);
  });

  // AC-22: the Intent and Blast slots sit in the brief grid in every rendered state.
  describe("with the real brief card (AC-22)", () => {
    const resp = (r: Partial<PrBriefResponse>) => ({
      data: { status: "none", stale: false, brief: null, ...r } as PrBriefResponse,
      isLoading: false,
      isError: false,
      error: null,
    });
    const BRIEF = {
      summary: "Adds rate limiting.",
      risks: { risks: [] },
      review_focus: [],
      head_sha: "a1b2c3d4e5f6",
      generated_at: "2026-10-02T09:00:00Z",
      model: "m",
      usage: { llm_calls: 1, tokens_in: 1, tokens_out: 1, cost_usd: 0.01, duration_ms: 1 },
      inputs: { missing: [], truncated: [], skipped: [], input_tokens: 1 },
      dropped_items: 0,
    } as PrBriefResponse["brief"];

    const expectBoth = () => {
      expect(screen.getByText("intent-card")).toBeInTheDocument();
      expect(screen.getByText("blast-card")).toBeInTheDocument();
    };

    it.each([
      ["no brief yet", () => briefQuery.mockReturnValue(resp({ status: "none" }))],
      ["ready brief", () => briefQuery.mockReturnValue(resp({ status: "ready", brief: BRIEF }))],
      ["stale brief", () => briefQuery.mockReturnValue(resp({ status: "ready", stale: true, brief: BRIEF }))],
      ["generating", () => briefQuery.mockReturnValue(resp({ status: "generating" }))],
      [
        "loading",
        () => briefQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null }),
      ],
      [
        "load error",
        () =>
          briefQuery.mockReturnValue({
            data: undefined,
            isLoading: false,
            isError: true,
            error: new Error("boom"),
          }),
      ],
      [
        "generation failed",
        () => {
          briefQuery.mockReturnValue(resp({ status: "none" }));
          genState.isError = true;
          genState.error = new Error("boom");
        },
      ],
    ])("shows both Intent and Blast cards: %s", (_name, setup) => {
      useReal.current = true;
      setup();
      renderTab();
      expectBoth();
    });
  });
});
