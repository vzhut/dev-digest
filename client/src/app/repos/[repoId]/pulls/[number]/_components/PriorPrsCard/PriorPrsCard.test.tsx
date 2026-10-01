import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrHistory } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";

const historyQuery = vi.fn();
vi.mock("@/lib/hooks/blast", () => ({
  usePrHistory: () => historyQuery(),
}));

import { PriorPrsCard } from "./PriorPrsCard";

const HISTORY: PrHistory = {
  history: [
    {
      pr_number: 410,
      title: "Fix rate limiter edge case",
      merged_at: "2026-09-01T00:00:00.000Z",
      author: "octocat",
      files_overlap: ["server/src/modules/reviews/service.ts"],
      notes: "touched 1 of 2 changed files",
    },
  ],
};

function renderCard(props: Partial<Parameters<typeof PriorPrsCard>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <PriorPrsCard prId="pr1" repoFullName="vzhut/dev-digest" {...props} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("PriorPrsCard", () => {
  it("renders each prior PR with a link to GitHub, the author, merge date and overlap count", () => {
    historyQuery.mockReturnValue({ data: HISTORY, isLoading: false, isError: false });
    renderCard();

    const link = screen.getByRole("link", { name: "#410 Fix rate limiter edge case" });
    expect(link).toHaveAttribute("href", "https://github.com/vzhut/dev-digest/pull/410");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/octocat/)).toBeInTheDocument();
    expect(screen.getByText(/1 overlapping files/)).toBeInTheDocument();
  });

  it("renders the PR title as plain text (no link) when repoFullName is still null", () => {
    historyQuery.mockReturnValue({ data: HISTORY, isLoading: false, isError: false });
    renderCard({ repoFullName: null });

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("#410 Fix rate limiter edge case")).toBeInTheDocument();
  });

  it("shows the empty message when there is no history", () => {
    historyQuery.mockReturnValue({ data: { history: [] }, isLoading: false, isError: false });
    renderCard();

    expect(screen.getByText(messages.history.empty)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows its own degraded message (not the empty text) when no GitHub token is configured", () => {
    historyQuery.mockReturnValue({
      data: { history: [], degraded: true, reason: "no_github_token" },
      isLoading: false,
      isError: false,
    });
    renderCard();

    expect(screen.getByRole("status")).toHaveTextContent(messages.history.degraded.no_github_token);
    expect(screen.queryByText(messages.history.empty)).not.toBeInTheDocument();
  });

  it("shows an error state with retry when the hook fails", () => {
    const refetch = vi.fn();
    historyQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      refetch,
    });
    renderCard();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
