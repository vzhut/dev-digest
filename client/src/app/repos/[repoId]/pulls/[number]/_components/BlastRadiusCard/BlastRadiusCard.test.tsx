import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";

const blastQuery = vi.fn();
const resyncHook = vi.fn();
vi.mock("@/lib/hooks/blast", () => ({
  useBlastRadius: () => blastQuery(),
}));
vi.mock("@/lib/hooks/repo-intel", () => ({
  useResyncRepoIntel: () => resyncHook(),
}));
vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => <pre data-testid="mermaid-diagram">{chart}</pre>,
}));

import { BlastRadiusCard } from "./BlastRadiusCard";

const BLAST: BlastRadius = {
  changed_symbols: [{ name: "runReview", file: "server/src/modules/reviews/service.ts", kind: "function" }],
  downstream: [
    {
      symbol: "runReview",
      file: "server/src/modules/reviews/service.ts",
      callers: [{ name: "handler", file: "server/src/modules/pulls/routes.ts", line: 42 }],
      callers_total: 1,
      endpoints_affected: ["GET /pulls/:id"],
      crons_affected: [],
    },
  ],
  summary: "1 of 1 changed symbol has callers: 1 caller, 1 endpoint, 0 crons.",
  stats: { symbols_changed: 1, symbols_affected: 1, callers: 1, endpoints: 1, crons: 0 },
  indexed_sha: "23e6c2c",
};

function renderCard(props: Partial<Parameters<typeof BlastRadiusCard>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastRadiusCard prId="pr1" repoId="repo1" repoFullName="vzhut/dev-digest" baseRef="main" {...props} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("BlastRadiusCard", () => {
  it("shows the summary stats and a caller link to GitHub, with endpoints and crons in separate lists", () => {
    blastQuery.mockReturnValue({ data: BLAST, isLoading: false, isError: false });
    renderCard();

    expect(screen.getByText(BLAST.summary)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /server\/src\/modules\/pulls\/routes.ts:42/ });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/vzhut/dev-digest/blob/23e6c2c/server/src/modules/pulls/routes.ts#L42",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    expect(screen.getByText("Endpoints")).toBeInTheDocument();
    expect(screen.getByText("GET /pulls/:id")).toBeInTheDocument();
    expect(screen.queryByText("Cron / jobs")).not.toBeInTheDocument();
  });

  it("shows the no-downstream text without an empty list when nothing has callers", () => {
    blastQuery.mockReturnValue({
      data: {
        ...BLAST,
        downstream: [],
        stats: { symbols_changed: 5, symbols_affected: 0, callers: 0, endpoints: 0, crons: 0 },
      },
      isLoading: false,
      isError: false,
    });
    renderCard();

    expect(screen.getByText("5 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows the incomplete marker with the translated reason and still renders the map", () => {
    resyncHook.mockReturnValue({ resync: vi.fn(), phase: "idle", isResyncing: false });
    blastQuery.mockReturnValue({
      data: { ...BLAST, degraded: true, reason: "index_partial", index_status: "partial" },
      isLoading: false,
      isError: false,
    });
    renderCard();

    expect(screen.getByRole("status")).toHaveTextContent("the index only partially covers this repo");
    expect(screen.getByText("GET /pulls/:id")).toBeInTheDocument();
  });

  it("shows an error state with retry when the hook fails", () => {
    const refetch = vi.fn();
    blastQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("boom"), refetch });
    renderCard();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps only the first symbol expanded; clicking a collapsed one reveals its callers", () => {
    resyncHook.mockReturnValue({ resync: vi.fn(), phase: "idle", isResyncing: false });
    const second = {
      symbol: "otherFn",
      file: "server/src/modules/reviews/other.ts",
      callers: [{ name: "otherHandler", file: "server/src/modules/pulls/other-routes.ts", line: 7 }],
      callers_total: 1,
      endpoints_affected: [] as string[],
      crons_affected: [] as string[],
    };
    blastQuery.mockReturnValue({
      data: { ...BLAST, downstream: [...BLAST.downstream, second] },
      isLoading: false,
      isError: false,
    });
    renderCard();

    const [first, secondToggle] = screen.getAllByRole("button", { name: /callers for/i });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(secondToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("otherHandler")).not.toBeInTheDocument();

    fireEvent.click(secondToggle!);

    expect(secondToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("otherHandler")).toBeInTheDocument();
  });

  it("calls the resync mutation exactly once when the button is clicked", () => {
    const resync = vi.fn();
    resyncHook.mockReturnValue({ resync, phase: "idle", isResyncing: false });
    blastQuery.mockReturnValue({
      data: { ...BLAST, degraded: true, reason: "index_partial", index_status: "partial" },
      isLoading: false,
      isError: false,
    });
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Resync" }));

    expect(resync).toHaveBeenCalledTimes(1);
  });

  it("shows the queued state once the resync has been enqueued", () => {
    resyncHook.mockReturnValue({ resync: vi.fn(), phase: "queued", isResyncing: false });
    blastQuery.mockReturnValue({
      data: { ...BLAST, degraded: true, reason: "index_partial", index_status: "partial" },
      isLoading: false,
      isError: false,
    });
    renderCard();

    expect(screen.getByText(messages.resync.queued)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resync" })).toBeDisabled();
  });

  it("switches to the graph view and back to the tree", () => {
    resyncHook.mockReturnValue({ resync: vi.fn(), phase: "idle", isResyncing: false });
    blastQuery.mockReturnValue({ data: BLAST, isLoading: false, isError: false });
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));

    const diagram = screen.getByTestId("mermaid-diagram");
    expect(diagram.textContent).toContain("flowchart LR");
    expect(diagram.textContent).toContain("runReview");
    expect(screen.queryByRole("button", { name: /callers for/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "tree" }));

    expect(screen.queryByTestId("mermaid-diagram")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /callers for/i })[0]).toBeInTheDocument();
  });

  it("shows the failed state when the resync enqueue is degraded", () => {
    resyncHook.mockReturnValue({ resync: vi.fn(), phase: "failed", isResyncing: false });
    blastQuery.mockReturnValue({
      data: { ...BLAST, degraded: true, reason: "index_partial", index_status: "partial" },
      isLoading: false,
      isError: false,
    });
    renderCard();

    expect(screen.getByText(messages.resync.failed)).toBeInTheDocument();
  });
});
