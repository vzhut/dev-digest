import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const intentQuery = vi.fn();
const rerunMutate = vi.fn();
const rerunState = { isPending: false, isError: false, error: null as unknown };
vi.mock("@/lib/hooks/reviews", () => ({
  usePrIntent: () => intentQuery(),
  useRerunIntent: () => ({ mutate: rerunMutate, ...rerunState }),
}));

import { IntentCard } from "./IntentCard";

const RECORD: PrIntentRecord = {
  pr_id: "pr1",
  intent: "Add token-bucket rate limiting to public endpoints.",
  in_scope: ["rate limiter", "config defaults"],
  out_of_scope: ["users endpoint refactor"],
  risk_areas: ["webhooks", "config defaults"],
  head_sha: "a1b2c3d",
  stale: false,
  confidence: "medium",
  sources: [
    { kind: "pr_title", ref: "title", status: "used", chars: 40 },
    { kind: "pr_description", ref: "description", status: "used", chars: 300 },
    { kind: "github_issue", ref: "#12", status: "used", chars: 900 },
    { kind: "repo_file", ref: "specs/ratelimit.md", status: "missing", reason: "not found", chars: 0 },
  ],
  missing_context: ["specs/ratelimit.md (not found)"],
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_in: 1400,
  tokens_out: 180,
  cost_usd: 0.00031,
  duration_ms: 1200,
  created_at: "2026-09-24T10:00:00Z",
  updated_at: "2026-09-24T10:00:00Z",
};

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <IntentCard prId="pr1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  rerunMutate.mockReset();
  rerunState.isPending = false;
  rerunState.isError = false;
});
afterEach(cleanup);

describe("IntentCard", () => {
  it("shows the summary, scope lists, risk chips, sources and meta, and re-classifies on click", () => {
    intentQuery.mockReturnValue({ data: { intent: RECORD }, isLoading: false, isError: false });
    renderCard();

    expect(screen.getByText(RECORD.intent)).toBeInTheDocument();
    const inScope = screen.getByRole("list", { name: "2 in-scope items" });
    expect(within(inScope).getAllByRole("listitem")).toHaveLength(2);
    const outScope = screen.getByRole("list", { name: "1 out-of-scope item" });
    expect(within(outScope).getByText("users endpoint refactor")).toBeInTheDocument();
    expect(screen.getByText("webhooks")).toBeInTheDocument();
    expect(screen.getByText("Confidence: Medium")).toBeInTheDocument();
    expect(screen.getByText("deepseek-v4-flash · $0.0003")).toBeInTheDocument();
    expect(screen.getByText(/#12/)).toBeInTheDocument();
    expect(screen.getByText("specs/ratelimit.md (not found)")).toBeInTheDocument();
    expect(screen.queryByText(/changed since the intent/)).not.toBeInTheDocument();
    expect(screen.queryByText(/not used to downgrade/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Re-classify/ }));
    expect(rerunMutate).toHaveBeenCalledTimes(1);
  });

  it("hides the risk block when empty and shows stale and low-confidence notices", () => {
    intentQuery.mockReturnValue({
      data: { intent: { ...RECORD, risk_areas: null, stale: true, confidence: "low", missing_context: [] } },
      isLoading: false,
      isError: false,
    });
    renderCard();
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
    expect(screen.getByText(/changed since the intent was detected/)).toBeInTheDocument();
    expect(screen.getByText(/not used to downgrade findings/)).toBeInTheDocument();
  });

  it("disables the button while a re-run is pending", () => {
    rerunState.isPending = true;
    intentQuery.mockReturnValue({ data: { intent: RECORD }, isLoading: false, isError: false });
    renderCard();
    expect(screen.getByRole("button", { name: /Re-classify/ })).toBeDisabled();
  });

  it("offers Detect intent when nothing was derived yet", () => {
    intentQuery.mockReturnValue({ data: { intent: null }, isLoading: false, isError: false });
    renderCard();
    expect(screen.getByText("No intent detected yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Detect intent/ }));
    expect(rerunMutate).toHaveBeenCalledTimes(1);
  });

  it("shows a skeleton while loading and an error with retry on failure", () => {
    intentQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { unmount } = renderCard();
    expect(screen.getByRole("region", { name: "Intent" })).toHaveAttribute("aria-busy", "true");
    unmount();

    const refetch = vi.fn();
    intentQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("boom"), refetch });
    renderCard();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
