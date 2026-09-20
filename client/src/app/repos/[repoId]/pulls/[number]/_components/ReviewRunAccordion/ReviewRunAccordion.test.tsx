/**
 * ReviewRunAccordion — header summary, collapse/expand and the targeted-run
 * behaviour the Timeline drives (clicking an agent name opens that run).
 * Blockers are counted from non-dismissed CRITICAL findings only.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    review_id: "rev-1",
    severity: "WARNING",
    category: "security",
    title: "A finding",
    file: "src/a.ts",
    start_line: 1,
    end_line: 2,
    rationale: "because",
    confidence: 0.9,
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rev-1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: "run-1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: "deepseek/deepseek-v4-flash",
    cost_usd: null,
    tokens_in: null,
    tokens_out: null,
    created_at: "2026-06-11T18:44:34.000Z",
    findings: [],
    ...o,
  };
}

function renderAccordion(props: Partial<React.ComponentProps<typeof ReviewRunAccordion>> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <ReviewRunAccordion review={review()} prId="pr-1" {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ReviewRunAccordion", () => {
  it("counts only non-dismissed CRITICAL findings as blockers", () => {
    renderAccordion({
      review: review({
        findings: [
          finding({ id: "f1", severity: "CRITICAL" }),
          finding({ id: "f2", severity: "CRITICAL", dismissed_at: "2026-06-12T00:00:00.000Z" }),
          finding({ id: "f3", severity: "WARNING" }),
        ],
      }),
    });
    expect(screen.getByText(/3 findings/)).toBeInTheDocument();
    expect(screen.getByText(/1 blocker\b/)).toBeInTheDocument();
  });

  it("says '0 findings' with no blocker text for an empty review", () => {
    renderAccordion();
    expect(screen.getByText("0 findings")).toBeInTheDocument();
    expect(screen.queryByText(/blocker/)).not.toBeInTheDocument();
  });

  it("is collapsed by default and shows the verdict banner once opened", () => {
    renderAccordion({
      review: review({ verdict: "request_changes", summary: "Two blockers found" }),
    });
    expect(screen.queryByText("Two blockers found")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Security Reviewer/ }));
    expect(screen.getByText("Two blockers found")).toBeInTheDocument();
  });

  it("opens itself when the Timeline targets this run", () => {
    // jsdom has no scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
    renderAccordion({
      review: review({ verdict: "approve", summary: "Looks good" }),
      targetRunId: "run-1",
      targetNonce: 1,
    });
    expect(screen.getByText("Looks good")).toBeInTheDocument();
  });
});
