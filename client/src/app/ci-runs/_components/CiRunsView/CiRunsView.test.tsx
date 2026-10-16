import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiRunItem } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import ci from "../../../../../messages/en/ci.json";
import { CiRunsView } from "./CiRunsView";

const useCiRuns = vi.fn();
vi.mock("@/lib/hooks/ci", () => ({ useCiRuns: () => useCiRuns() }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const refetch = vi.fn();

const run = (id: string, over: Partial<CiRunItem> = {}): CiRunItem => ({
  id,
  agent_id: "a1",
  agent_name: "Security",
  repo: "acme/api",
  pr_number: 1,
  pr_url: null,
  commit_sha: null,
  status: "done",
  verdict: "pass",
  blockers: 0,
  findings_count: 0,
  critical: 0,
  warning: 0,
  suggestion: 0,
  cost_usd: 0.5,
  duration_ms: 1000,
  ran_at: "2026-10-01T10:00:00Z",
  job_url: "https://github.com/acme/api/actions/runs/1",
  ...over,
});

const query = (over: Record<string, unknown> = {}) => ({
  data: undefined,
  isError: false,
  error: null,
  isFetching: false,
  refetch,
  ...over,
});

const withRuns = (runs: CiRunItem[], over: Record<string, unknown> = {}) =>
  query({ data: { runs, accepted: 0, duplicates: 0, rejected: 0 }, ...over });

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci }}>
      <CiRunsView />
    </NextIntlClientProvider>,
  );
}

const bodyRows = () => screen.getAllByRole("row").slice(1);

beforeEach(() => {
  refetch.mockReset();
  useCiRuns.mockReset();
});
afterEach(cleanup);

describe("CiRunsView", () => {
  it("shows a loading skeleton while the first sync is running", () => {
    useCiRuns.mockReturnValue(query());
    renderView();
    expect(screen.getByRole("status", { name: "Loading CI runs" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the empty state, without filters, when no CI run exists", () => {
    useCiRuns.mockReturnValue(withRuns([]));
    renderView();
    expect(screen.getByText("No CI runs yet")).toBeInTheDocument();
    expect(screen.queryByLabelText("Agent")).not.toBeInTheDocument();
  });

  it("shows the server's message on error and retries with a refetch", () => {
    useCiRuns.mockReturnValue(query({ isError: true, error: new ApiError("GitHub is down", 502, "github_unavailable") }));
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load CI runs");
    expect(screen.getByRole("alert")).toHaveTextContent("GitHub is down");
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the localized body for a non-API error", () => {
    useCiRuns.mockReturnValue(query({ isError: true, error: new TypeError("boom") }));
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("The DevDigest engine didn't answer.");
  });

  it("keeps the table when a background refetch failed but data is already there", () => {
    useCiRuns.mockReturnValue(withRuns([run("1")], { isError: true, error: new Error("x") }));
    renderView();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lists runs newest first and narrows them with the labelled agent and repository filters", () => {
    useCiRuns.mockReturnValue(
      withRuns([
        run("old", { agent_id: "a1", agent_name: "Security", repo: "acme/api", pr_number: 1, ran_at: "2026-10-01T10:00:00Z" }),
        run("new", { agent_id: "a2", agent_name: "Style", repo: "acme/web", pr_number: 2, ran_at: "2026-10-03T10:00:00Z" }),
        run("mid", { agent_id: "a1", agent_name: "Security", repo: "acme/web", pr_number: 3, ran_at: "2026-10-02T10:00:00Z" }),
      ]),
    );
    renderView();

    expect(bodyRows().map((r) => within(r).getByText(/^#\d$/).textContent)).toEqual(["#2", "#3", "#1"]);

    const agent = screen.getByLabelText("Agent");
    expect(within(agent).getAllByRole("option").map((o) => o.textContent)).toEqual(["All agents", "Security", "Style"]);
    fireEvent.change(agent, { target: { value: "a1" } });
    expect(bodyRows().map((r) => within(r).getByText(/^#\d$/).textContent)).toEqual(["#3", "#1"]);

    const repo = screen.getByLabelText("Repository");
    expect(within(repo).getAllByRole("option").map((o) => o.textContent)).toEqual(["All repos", "acme/api", "acme/web"]);
    fireEvent.change(repo, { target: { value: "acme/web" } });
    expect(bodyRows()).toHaveLength(1);
    expect(within(bodyRows()[0]!).getByText("#3")).toBeInTheDocument();
  });

  it("says no run matches when the filters hide everything, and recovers when they are cleared", () => {
    useCiRuns.mockReturnValue(
      withRuns([
        run("1", { agent_id: "a1", agent_name: "Security", repo: "acme/api" }),
        run("2", { agent_id: "a2", agent_name: "Style", repo: "acme/web" }),
      ]),
    );
    renderView();
    fireEvent.change(screen.getByLabelText("Agent"), { target: { value: "a1" } });
    fireEvent.change(screen.getByLabelText("Repository"), { target: { value: "acme/web" } });

    expect(screen.getByText("No CI runs match these filters.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("No CI runs yet")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Agent"), { target: { value: "" } });
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("Refresh runs the sync again and shows progress while it is fetching", () => {
    useCiRuns.mockReturnValue(withRuns([run("1")]));
    const { unmount } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    unmount();

    useCiRuns.mockReturnValue(withRuns([run("1")], { isFetching: true }));
    renderView();
    expect(screen.getByRole("button", { name: /Refreshing/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });
});
