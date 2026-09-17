/**
 * PRRow — the COST and FINDINGS cells.
 *  - COST: `cost_usd` is the SUM across every agent run on the PR, so a PR that
 *    was never reviewed must read "—" rather than a fabricated $0.00.
 *  - FINDINGS: the latest review's findings behind a hover popover. "—" = never
 *    reviewed, "0" = clean review; the popover must never trigger the row's
 *    click-to-open navigation.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingPreview, PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  push.mockClear();
});

const FINDINGS: FindingPreview[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    confidence: 0.98,
    summary: "Line 12 contains a literal sk_live_ Stripe key.",
  },
  {
    id: "f2",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query in user list endpoint",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    confidence: 0.86,
    summary: "The loop calls db.posts.findMany once per user.",
  },
];

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "abc123",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: "2026-06-13T15:00:00.000Z",
    updated_at: "2026-06-13T18:00:00.000Z",
    score: 61,
    cost_usd: 0.014,
    latest_findings: FINDINGS,
    ...o,
  };
}

function renderRow(meta: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={meta} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

const findingsTrigger = () => screen.getByRole("button", { name: /findings? in this run/ });

describe("PRRow — cost cell", () => {
  it("shows the summed spend for the PR", () => {
    renderRow(pr({ cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows '—' for a PR with no priced runs", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});

describe("PRRow — findings cell", () => {
  it("shows '—' for a PR that was never reviewed", () => {
    renderRow(pr({ score: null, latest_findings: null, cost_usd: 0.014 }));
    // SCORE and FINDINGS both read "—" (cost is known here, so it is not a third).
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows '0' when the latest review found nothing", () => {
    renderRow(pr({ latest_findings: [] }));
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hovering the severity icons shows the latest run's read-only previews", () => {
    renderRow(pr({}));
    fireEvent.mouseEnter(findingsTrigger());

    const popover = screen.getByRole("tooltip");
    expect(within(popover).getByText("2 findings in this run")).toBeInTheDocument();
    expect(within(popover).getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(within(popover).getByText("src/api/users.ts:45-52")).toBeInTheDocument();
    expect(within(popover).queryAllByRole("button")).toHaveLength(0);
  });

  it("clicking the icons or the popover does not open the PR; clicking the row still does", () => {
    renderRow(pr({}));
    fireEvent.click(findingsTrigger());
    fireEvent.click(within(screen.getByRole("tooltip")).getByText("N+1 query in user list endpoint"));
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Add rate limiting to public API endpoints"));
    expect(push).toHaveBeenCalledWith("/repos/repo-1/pulls/482");
  });
});
