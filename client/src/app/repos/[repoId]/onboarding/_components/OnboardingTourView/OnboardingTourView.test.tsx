/**
 * OnboardingTourView — states (loading / error / not cloned / none / generating / ready),
 * header + usage label, nav list, notices, Regenerate and Share. Hooks are mocked at
 * `@/lib/hooks/onboarding`, so no request is ever made.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingTourResponse, Tour } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { ToastProvider } from "@/lib/toast";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const USAGE = { llm_calls: 1 as const, tokens_in: 8000, tokens_out: 1119, cost_usd: 0.0012, model: "openai/gpt-x", duration_ms: 1, dropped_items: 0 };

const state: { query: Record<string, unknown>; pending: boolean } = { query: {}, pending: false };
const refetch = vi.fn();
const generateMutate = vi.fn();
const writeText = vi.fn(() => Promise.resolve());

function makeTour(over: Partial<Tour> = {}): Tour {
  return {
    repo_id: "r1",
    generated_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    source_sha: SHA,
    mode: "llm",
    index: { status: "ready", reason: null, files_indexed: 12450, files_skipped: 0, files_total: 12450, bounded: false, hotness_available: true },
    usage: USAGE,
    architecture: { summary_md: "Hello", diagram: null, stack: [], structure: [], routes: [] },
    critical_paths: [{ path: "src/server.ts", reason: null, computed_reason: "imported by 9 files" }],
    run_locally: [{ command: "pnpm dev", source_path: "package.json", note: null }],
    reading_path: [{ path: "src/a.ts", score: 1, pagerank: 1, hotness: 0, why: null, computed_reason: "imported by 3 files" }],
    first_tasks: [{ title: "Fix a thing", path: "src/a.ts", path_kind: "file", complexity: "low" }],
    ...over,
  };
}
const ready = (tour: Tour, index_sha: string | null = SHA): OnboardingTourResponse => ({ status: "ready", tour, index_sha });
const setData = (data: OnboardingTourResponse) => {
  state.query = { data, isLoading: false, isError: false, error: null, refetch };
};

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb?: { label: string }[] }) => (
    <div>
      <nav aria-label="breadcrumb">{(crumb ?? []).map((c) => c.label).join(" › ")}</nav>
      {children}
    </div>
  ),
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>repo-not-found</div> }));
vi.mock("@/components/mermaid-diagram", () => ({ MermaidDiagram: () => <div /> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks/onboarding", () => ({
  useOnboardingTour: () => state.query,
  useGenerateOnboardingTour: () => ({ mutate: generateMutate, isPending: state.pending }),
}));

import { OnboardingTourView } from "./OnboardingTourView";

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  window.history.replaceState(null, "", "/repos/r1/onboarding");
});
afterEach(() => {
  cleanup();
  state.query = {};
  state.pending = false;
  refetch.mockReset();
  generateMutate.mockReset();
  writeText.mockClear();
});

const wrap = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ToastProvider>
        <OnboardingTourView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );

describe("OnboardingTourView", () => {
  it("renders the header, usage, nav list and five cards; nav click focuses the heading and sets the fragment", () => {
    setData(ready(makeTour()));
    wrap();
    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toHaveTextContent("acme/payments-api › Onboarding Tour");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Onboarding for payments-api");
    expect(screen.getByText("Generated from index of 12,450 files · generated 3h ago")).toBeInTheDocument();
    expect(screen.getByText("1 LLM call · 9,119 tok · $0.0012")).toBeInTheDocument();
    expect(screen.getByTitle("Model: openai/gpt-x")).toBeInTheDocument();

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Architecture", "Critical paths", "Run locally", "Reading path", "First tasks"]);
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(within(nav).getAllByRole("link")).toHaveLength(5);

    fireEvent.click(within(nav).getByRole("link", { name: "Reading path" }));
    expect(window.location.hash).toBe("#reading-path");
    expect(screen.getByRole("heading", { name: "Reading path" })).toHaveFocus();
    expect(generateMutate).not.toHaveBeenCalled();
  });

  it("formats unknown cost as a dash and a zero-call tour as '0 LLM calls'", () => {
    setData(ready(makeTour({ usage: { ...USAGE, cost_usd: null } })));
    const { unmount } = wrap();
    expect(screen.getByText("1 LLM call · 9,119 tok · —")).toBeInTheDocument();
    unmount();

    setData(ready(makeTour({ usage: { ...USAGE, llm_calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, model: null } })));
    wrap();
    expect(screen.getByText("0 LLM calls")).toBeInTheDocument();
    expect(screen.getByTitle("No LLM call was made")).toBeInTheDocument();
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });

  it("regenerates without confirmation and shares the page URL without any request", async () => {
    setData(ready(makeTour()));
    wrap();
    const regen = screen.getByRole("button", { name: "Regenerate" });
    expect(regen).toHaveAttribute("title", "Makes one LLM call");
    fireEvent.click(regen);
    expect(generateMutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    generateMutate.mockReset();
    fireEvent.click(within(screen.getByRole("navigation", { name: "On this page" })).getByRole("link", { name: "Reading path" }));
    fireEvent.click(screen.getByRole("button", { name: "Share link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/repos/r1/onboarding#reading-path`));
    expect(await screen.findByText(/opens for people with access to this DevDigest instance/)).toBeInTheDocument();
    expect(generateMutate).not.toHaveBeenCalled();
  });

  it("reports a failed Share instead of throwing when the clipboard API is unavailable", async () => {
    setData(ready(makeTour()));
    wrap();
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    try {
      fireEvent.click(screen.getByRole("button", { name: "Share link" }));
      expect(await screen.findByText("Couldn't copy the link")).toBeInTheDocument();
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
    }
  });

  it("shows the stale notice only when the index commit differs, plus the bounded coverage note", () => {
    setData(ready(makeTour({ index: { status: "ready", reason: null, files_indexed: 5000, files_skipped: 0, files_total: 12450, bounded: true, hotness_available: true } }), "fffffff"));
    const { unmount } = wrap();
    expect(screen.getByText("The code has changed since this tour was generated.")).toBeInTheDocument();
    expect(screen.getByText("Generated from index of 5000 of 12450 files · generated 3h ago")).toBeInTheDocument();
    expect(screen.getByText(/covers only the indexed files \(5000 of 12450\)/)).toBeInTheDocument();
    unmount();

    setData(ready(makeTour({ index: { status: "ready", reason: null, files_indexed: 7, files_skipped: 0, files_total: null, bounded: false, hotness_available: true } })));
    wrap();
    expect(screen.queryByText(/code has changed/)).not.toBeInTheDocument();
    expect(screen.getByText("Generated from index of 7 files · generated 3h ago")).toBeInTheDocument();
    expect(screen.getByText(/Coverage unknown since the last refresh/)).toBeInTheDocument();
  });

  it("explains skeleton reasons, a partial index and a failed regeneration", () => {
    const base = { index: { status: "degraded", reason: null, files_indexed: 1, files_skipped: 0, files_total: 1, bounded: false, hotness_available: false } };
    setData(ready(makeTour({ ...base, mode: "skeleton", skeleton_reason: "index_degraded" })));
    const a = wrap();
    expect(screen.getByText(/index isn't usable \(status: degraded\)/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Regenerate" }).length).toBeGreaterThan(1);
    a.unmount();

    setData(ready(makeTour({ mode: "skeleton", skeleton_reason: "llm_unavailable" })));
    const b = wrap();
    expect(screen.getByText(/No LLM is configured/)).toBeInTheDocument();
    b.unmount();

    setData(ready(makeTour({ mode: "skeleton", skeleton_reason: "llm_failed", skeleton_detail: "timeout" })));
    const c = wrap();
    expect(screen.getByText(/The LLM call failed \(timeout\)/)).toBeInTheDocument();
    c.unmount();

    setData(ready(makeTour({
      index: { status: "partial", reason: null, files_indexed: 9, files_skipped: 3, files_total: 12, bounded: false, hotness_available: true },
      last_attempt: { at: new Date(Date.now() - 2 * 3600_000).toISOString(), skeleton_reason: "llm_failed", detail: null, usage: USAGE },
    })));
    wrap();
    expect(screen.getByText("The index is partial: 3 files were skipped.")).toBeInTheDocument();
    expect(screen.getByText(/last regeneration failed 2h ago: the LLM call failed/)).toBeInTheDocument();
  });

  it("covers loading, error + retry, not cloned, no tour and generating", () => {
    state.query = { data: undefined, isLoading: true, isError: false, error: null, refetch };
    const a = wrap();
    expect(screen.getByRole("status", { name: "Loading the onboarding tour" })).toBeInTheDocument();
    a.unmount();

    state.query = { data: undefined, isLoading: false, isError: true, error: new Error("boom"), refetch };
    const b = wrap();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
    b.unmount();

    setData({ status: "not_cloned", index_sha: null });
    const c = wrap();
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate tour" })).toBeDisabled();
    c.unmount();

    setData({ status: "none", tour: null, index_sha: null });
    const d = wrap();
    expect(screen.getByText(/Generating the tour makes one LLM call/)).toBeInTheDocument();
    expect(generateMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Generate tour" }));
    expect(generateMutate).toHaveBeenCalledTimes(1);
    d.unmount();

    setData({ status: "generating", tour: makeTour(), index_sha: SHA });
    wrap();
    const progress = screen.getByText(/Generating the tour\./).closest('[role="status"]');
    expect(progress).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  });
});
