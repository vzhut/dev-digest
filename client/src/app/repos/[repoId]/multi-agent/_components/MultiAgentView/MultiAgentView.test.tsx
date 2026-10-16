/**
 * MultiAgentView routing (AC-3 / AC-24): `?run=` shows that run, no params reopens the repo's
 * latest run (with a Configure run button) or falls back to the form, `?configure=1` shows the
 * form with a way back to the last run.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import multiAgent from "../../../../../../../messages/en/multiAgent.json";

const push = vi.fn();
const state: {
  search: string;
  latest: { data?: { id: string | null }; isLoading: boolean };
  notFound: boolean;
} = { search: "", latest: { data: { id: null }, isLoading: false }, notFound: false };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ repoId: "r1" }),
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb?: { label: string }[] }) => (
    <div>
      <nav aria-label="breadcrumb">{(crumb ?? []).map((c) => c.label).join(" > ")}</nav>
      {children}
    </div>
  ),
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>repo-not-found</div> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/app" } }),
  useRepoNotFound: () => state.notFound,
}));
vi.mock("@/lib/hooks/reviews", () => ({ useLatestMultiAgentRun: () => state.latest }));
vi.mock("../MultiAgentResults", () => ({
  MultiAgentResults: ({ runId, mode }: { runId: string; mode: string }) => (
    <div>
      results:{runId}:{mode}
    </div>
  ),
}));
vi.mock("../ConfigureRun", () => ({ ConfigureRun: ({ repoId }: { repoId: string }) => <div>configure-form:{repoId}</div> }));

import { MultiAgentView } from "./MultiAgentView";

beforeEach(() => {
  push.mockReset();
  state.search = "";
  state.latest = { data: { id: null }, isLoading: false };
  state.notFound = false;
});
afterEach(cleanup);

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent }}>
      <MultiAgentView />
    </NextIntlClientProvider>,
  );
}

describe("MultiAgentView", () => {
  it("?run=<id> shows that run (not the latest), a Configure run button and a working mode switch", () => {
    state.search = "run=m7";
    state.latest = { data: { id: "latest-1" }, isLoading: false };
    renderView();

    expect(screen.getByText("results:m7:columns")).toBeInTheDocument();
    expect(screen.queryByText(/configure-form/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tabs" }));
    expect(screen.getByText("results:m7:tabs")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    expect(push).toHaveBeenCalledWith("/repos/r1/multi-agent?configure=1");
  });

  it("no params reopens the latest run, with a Configure run button", () => {
    state.latest = { data: { id: "latest-1" }, isLoading: false };
    renderView();

    expect(screen.getByText("results:latest-1:columns")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Configure run" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to last run" })).not.toBeInTheDocument();
  });

  it("no params and no run yet shows the Configure run form without results controls", () => {
    renderView();

    expect(screen.getByText("configure-form:r1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configure run" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Columns" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to last run" })).not.toBeInTheDocument();
  });

  it("shows a loading line while the latest run is being resolved", () => {
    state.latest = { data: undefined, isLoading: true };
    renderView();

    expect(screen.getByText("Loading the last run…")).toBeInTheDocument();
    expect(screen.queryByText(/configure-form/)).not.toBeInTheDocument();
  });

  it("?configure=1 shows the form and, with a latest run, a Back to last run button that returns to it", () => {
    state.search = "configure=1";
    state.latest = { data: { id: "latest-1" }, isLoading: false };
    renderView();

    expect(screen.getByText("configure-form:r1")).toBeInTheDocument();
    expect(screen.getByLabelText("breadcrumb")).toHaveTextContent("acme/app > Multi-Agent Review > Configure run");
    expect(screen.queryByRole("button", { name: "Configure run" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to last run" }));
    expect(push).toHaveBeenCalledWith("/repos/r1/multi-agent");
  });

  it("?configure=1&run=<id> goes back to that specific run", () => {
    state.search = "configure=1&run=m7";
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Back to last run" }));
    expect(push).toHaveBeenCalledWith("/repos/r1/multi-agent?run=m7");
  });

  it("?configure=1 without any run offers no way back", () => {
    state.search = "configure=1";
    renderView();

    expect(screen.getByText("configure-form:r1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to last run" })).not.toBeInTheDocument();
  });

  it("renders the repo-not-found state for an unknown repo", () => {
    state.notFound = true;
    renderView();
    expect(screen.getByText("repo-not-found")).toBeInTheDocument();
  });
});
