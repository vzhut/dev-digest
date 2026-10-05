import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief, PrBriefResponse } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

const briefQuery = vi.fn();
const generateMutate = vi.fn();
const refetch = vi.fn();
const genState = { isPending: false, isError: false, error: null as unknown };
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ refetch, ...briefQuery() }),
  useGeneratePrBrief: () => ({ mutate: generateMutate, ...genState }),
}));

import { PrBriefCard } from "./PrBriefCard";

const BRIEF: PrBrief = {
  summary: "Adds rate limiting to public endpoints.",
  risks: {
    risks: [
      {
        kind: "perf",
        title: "Hot path lock",
        explanation: "The limiter takes a global lock.",
        severity: "high",
        file_refs: ["src/limiter.ts:10-20", "src/other.ts"],
      },
    ],
  },
  review_focus: [
    { file: "src/limiter.ts", line: 12, reason: "bucket refill math" },
    { file: "docs/readme.md", line: 3, reason: "not in diff" },
  ],
  head_sha: "a1b2c3d4e5f6",
  generated_at: "2026-10-02T09:00:00Z",
  model: "deepseek/deepseek-v4-flash",
  usage: { llm_calls: 1, tokens_in: 8200, tokens_out: 1300, cost_usd: 0.014, duration_ms: 900 },
  inputs: { missing: [], truncated: [], skipped: [], input_tokens: 5000 },
  dropped_items: 0,
};

const ready = (over: Partial<PrBriefResponse> = {}, brief: PrBrief = BRIEF) => ({
  data: { status: "ready", stale: false, brief, ...over } as PrBriefResponse,
  isLoading: false,
  isError: false,
  error: null,
});
const none = () => ({
  data: { status: "none", stale: false, brief: null } as PrBriefResponse,
  isLoading: false,
  isError: false,
  error: null,
});

const onOpenInDiff = vi.fn();

function renderCard(props: Partial<React.ComponentProps<typeof PrBriefCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
      <PrBriefCard
        prId="pr1"
        diffPaths={["src/limiter.ts", "src/other.ts"]}
        filesCount={2}
        latestReview={null}
        intent={(risks) => (
          <div>
            INTENT-SLOT
            {risks}
          </div>
        )}
        blast={<div>BLAST-SLOT</div>}
        onOpenInDiff={onOpenInDiff}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  genState.isPending = false;
  genState.isError = false;
  genState.error = null;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PrBriefCard", () => {
  it("none: shows the note and Generate, never auto-generates, keeps Intent and Blast in the grid", () => {
    briefQuery.mockReturnValue(none());
    renderCard();
    expect(screen.getByText(/makes one LLM call/i)).toBeInTheDocument();
    expect(screen.getByText("INTENT-SLOT")).toBeInTheDocument();
    expect(screen.getByText("BLAST-SLOT")).toBeInTheDocument();
    expect(generateMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("hands the risk areas to the intent slot once when a brief is ready, and none without a brief", () => {
    briefQuery.mockReturnValue(ready());
    const { unmount } = renderCard();
    const intentSlot = screen.getByText(/INTENT-SLOT/);
    expect(within(intentSlot).getByRole("region", { name: "Risk areas" })).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "Risk areas" })).toHaveLength(1);
    expect(screen.getAllByText("Hot path lock")).toHaveLength(1);
    unmount();

    briefQuery.mockReturnValue(none());
    renderCard();
    expect(screen.queryByRole("region", { name: "Risk areas" })).not.toBeInTheDocument();
    expect(screen.getByText(/INTENT-SLOT/)).toBeInTheDocument();
  });

  it("none with 0 files: Generate is disabled with a nothing-to-brief note", () => {
    briefQuery.mockReturnValue(none());
    renderCard({ filesCount: 0 });
    expect(screen.getByRole("button", { name: "Generate brief" })).toBeDisabled();
    expect(screen.getByText(/nothing to brief/i)).toBeInTheDocument();
  });

  it("loading and load error states", () => {
    briefQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null });
    const { unmount } = renderCard();
    expect(screen.getByLabelText("PR brief")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("INTENT-SLOT")).toBeInTheDocument();
    expect(screen.getByText("BLAST-SLOT")).toBeInTheDocument();
    unmount();
    briefQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError("boom", 500),
    });
    renderCard();
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
    expect(screen.getByText("INTENT-SLOT")).toBeInTheDocument();
    expect(screen.getByText("BLAST-SLOT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("generating: skeleton with role=status, disabled refresh, slots still rendered, no brief text", () => {
    briefQuery.mockReturnValue(ready());
    genState.isPending = true;
    renderCard();
    expect(screen.getByRole("status", { name: "Generating the brief…" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh brief" })).toBeDisabled();
    expect(screen.queryByText(BRIEF.summary)).not.toBeInTheDocument();
    expect(screen.queryByText("Hot path lock")).not.toBeInTheDocument();
    expect(screen.getByText("INTENT-SLOT")).toBeInTheDocument();
    expect(screen.getByText("BLAST-SLOT")).toBeInTheDocument();
  });

  it("ready: summary, usage, risks with severity text, review focus and navigation callbacks", () => {
    briefQuery.mockReturnValue(ready());
    renderCard();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.getByText("$0.014 8.2K→1.3K")).toHaveAttribute("title", "Model: deepseek/deepseek-v4-flash");
    expect(screen.getByText("Hot path lock")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();

    // risk expands
    const toggle = screen.getByRole("button", { name: /Show explanation for Hot path lock/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("The limiter takes a global lock.")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The limiter takes a global lock.")).toBeInTheDocument();

    // risk ref and review-focus item navigate
    fireEvent.click(screen.getByRole("button", { name: "Open src/limiter.ts:10-20 in Files changed" }));
    expect(onOpenInDiff).toHaveBeenLastCalledWith("src/limiter.ts", 10);
    fireEvent.click(screen.getByRole("button", { name: "Open src/limiter.ts:12 in Files changed" }));
    expect(onOpenInDiff).toHaveBeenLastCalledWith("src/limiter.ts", 12);
    expect(screen.getByText("— bucket refill math")).toBeInTheDocument();

    // a ref without a line still navigates (line 1)
    fireEvent.click(screen.getByRole("button", { name: "Open src/other.ts in Files changed" }));
    expect(onOpenInDiff).toHaveBeenLastCalledWith("src/other.ts", 1);
  });

  it("a file outside the diff stays on Overview with a message", () => {
    briefQuery.mockReturnValue(ready());
    renderCard();
    onOpenInDiff.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Open docs/readme.md:3 in Files changed" }));
    expect(onOpenInDiff).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("File not in this PR's diff");
  });

  it("refresh runs one generation and carries the one-LLM-call tooltip", () => {
    briefQuery.mockReturnValue(ready());
    renderCard();
    const btn = screen.getByRole("button", { name: "Refresh brief" });
    expect(btn).toHaveAttribute("title", expect.stringMatching(/one LLM call/i));
    fireEvent.click(btn);
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("unknown cost renders —", () => {
    briefQuery.mockReturnValue(
      ready({}, { ...BRIEF, usage: { ...BRIEF.usage!, cost_usd: null } }),
    );
    renderCard();
    expect(screen.getByText("— 8.2K→1.3K")).toBeInTheDocument();
  });

  it("verdict banner with the brief summary when a review exists; summary alone otherwise", () => {
    briefQuery.mockReturnValue(ready());
    const { unmount } = renderCard({
      latestReview: { verdict: "request_changes", score: 62, findingsCount: 4, blockers: 1, agentName: "Sec" },
    });
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("4 findings · 1 blockers")).toBeInTheDocument();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    unmount();
    renderCard();
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
  });

  it("empty risks and empty focus show their messages", () => {
    briefQuery.mockReturnValue(ready({}, { ...BRIEF, risks: { risks: [] }, review_focus: [] }));
    renderCard();
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
    expect(screen.getByText("Nothing specific to read first.")).toBeInTheDocument();
    expect(screen.getByText("0 items")).toBeInTheDocument();
  });

  it("names every missing input; missing intent and blast leave the rest intact", () => {
    briefQuery.mockReturnValue(
      ready(
        {},
        {
          ...BRIEF,
          inputs: {
            missing: [
              { input: "intent", reason: "not derived yet" },
              { input: "blast", reason: "index not ready" },
            ],
            truncated: [],
            skipped: [],
            input_tokens: 1,
          },
        },
      ),
    );
    renderCard();
    expect(
      screen.getByText("Generated without: Intent (not derived yet), Blast radius (index not ready)"),
    ).toBeInTheDocument();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.getByText("Hot path lock")).toBeInTheDocument();
  });

  it("older stored brief without inputs/usage renders without crashing", () => {
    briefQuery.mockReturnValue(
      ready({}, { summary: "Old", risks: { risks: [] }, review_focus: [] }),
    );
    renderCard();
    expect(screen.getByText("Old")).toBeInTheDocument();
    expect(screen.queryByText(/Generated without/)).not.toBeInTheDocument();
  });

  it("stale: shows the new-commits notice with a refresh action", () => {
    briefQuery.mockReturnValue(ready({ stale: true }));
    renderCard();
    expect(screen.getByText(/New commits arrived/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByText(/New commits arrived/).parentElement!).getByRole("button"));
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("first failure: error with the reason and Retry; no brief shown", () => {
    briefQuery.mockReturnValue(none());
    genState.isError = true;
    genState.error = new ApiError("provider timed out", 502, "brief_generation_failed");
    renderCard();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not generate the brief");
    expect(alert).toHaveTextContent("provider timed out");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByText("INTENT-SLOT")).toBeInTheDocument();
  });

  it("failed regeneration (AC-37): alert above the previous brief with time, short sha and Retry", () => {
    briefQuery.mockReturnValue(ready());
    genState.isError = true;
    genState.error = new ApiError("schema invalid", 502, "brief_generation_failed");
    renderCard();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/regeneration failed/i);
    expect(alert).toHaveTextContent("schema invalid");
    expect(alert).toHaveTextContent("a1b2c3d");
    expect(alert).toHaveTextContent(/ago|just now/);
    expect(alert).not.toHaveTextContent("a1b2c3d4");
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
  });

  it("config error points to Settings", () => {
    briefQuery.mockReturnValue(none());
    genState.isError = true;
    genState.error = new ApiError("No API key for openrouter", 400, "config_error");
    renderCard();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("model text is inert: script and javascript: links render as plain text", () => {
    const evil = {
      ...BRIEF,
      summary: "<script>alert(1)</script> [x](javascript:alert(1))",
      risks: {
        risks: [
          {
            kind: "x",
            title: "<img src=x onerror=alert(1)>",
            explanation: "[click](javascript:alert(2))",
            severity: "low" as const,
            file_refs: ["src/other.ts"],
          },
        ],
      },
    };
    briefQuery.mockReturnValue(ready({}, evil));
    const { container } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Show explanation for/ }));
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(screen.getByText("[click](javascript:alert(2))")).toBeInTheDocument();
  });
});
