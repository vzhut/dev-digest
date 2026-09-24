/**
 * PrDetailHeader — title/meta, the three tabs with their counts, and the
 * "already merged/closed" banner that warns a review here is informational.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrDetail } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: [] }) }));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { PrDetailHeader } from "./PrDetailHeader";

afterEach(cleanup);

function pr(o: Partial<PrDetail> = {}): PrDetail {
  return {
    id: "pr-1",
    number: 42,
    title: "Add rate limiting",
    author: "octocat",
    branch: "feat/rate-limit",
    base: "main",
    head_sha: "abc1234",
    additions: 120,
    deletions: 30,
    files_count: 7,
    status: "needs_review",
    opened_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-02T00:00:00.000Z",
    files: [],
    commits: [],
    ...o,
  };
}

function renderHeader(props: Partial<React.ComponentProps<typeof PrDetailHeader>> = {}) {
  const onSetTab = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PrDetailHeader
        pr={pr()}
        prId="pr-1"
        tab="overview"
        findingsCount={0}
        onSetTab={onSetTab}
        onRunStart={vi.fn()}
        onRunsStarted={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onSetTab };
}

describe("PrDetailHeader", () => {
  it("shows the PR number, title, branch and the +/− line counts", () => {
    renderHeader();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText(/Add rate limiting/)).toBeInTheDocument();
    expect(screen.getByText("feat/rate-limit")).toBeInTheDocument();
    expect(screen.getByText("+120")).toBeInTheDocument();
    expect(screen.getByText("−30")).toBeInTheDocument();
  });

  it("switches tab through the callback (the URL is the source of truth)", () => {
    const { onSetTab } = renderHeader();
    fireEvent.click(screen.getByText("Files changed"));
    expect(onSetTab).toHaveBeenCalledWith("diff");
  });

  it("shows the findings count only when there are findings", () => {
    renderHeader({ findingsCount: 0 });
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    cleanup();
    renderHeader({ findingsCount: 5 });
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("warns that a review on a merged PR is informational", () => {
    renderHeader({ pr: pr({ status: "merged" }) });
    expect(screen.getByText(/already merged/)).toBeInTheDocument();
  });

  it("shows no banner for an open PR", () => {
    renderHeader();
    expect(screen.queryByText(/informational/)).not.toBeInTheDocument();
  });
});
