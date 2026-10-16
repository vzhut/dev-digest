import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallation, CiRunItem } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import agents from "../../../../../../../../messages/en/agents.json";
import ci from "../../../../../../../../messages/en/ci.json";
import { CiTab } from "./CiTab";

const hooks = vi.hoisted(() => ({
  useCiInstallations: vi.fn(),
  useCiRuns: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/lib/hooks/ci", () => ({
  useCiInstallations: () => hooks.useCiInstallations(),
  useCiRuns: () => hooks.useCiRuns(),
}));
vi.mock("@/lib/hooks/agents", () => ({ useUpdateAgent: () => ({ mutate: hooks.mutate }) }));
// The wizard has its own test; here only "Add to CI opens it" matters.
vi.mock("./_components/ExportWizard", () => ({
  ExportWizard: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="wizard">
      <button onClick={onClose}>close wizard</button>
    </div>
  ),
}));

const agent = {
  id: "a1",
  name: "Security Reviewer",
  description: "",
  provider: "openrouter",
  model: "m",
  system_prompt: "p",
  enabled: true,
  version: 3,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
} as Agent;

const inst = (over: Partial<CiInstallation> = {}): CiInstallation => ({
  id: "i1",
  agent_id: "a1",
  repo: "acme/api",
  repo_id: "r1",
  target_type: "gha",
  installed_at: "2026-10-01T00:00:00Z",
  manifest_version: 3,
  workflow_version: 1,
  current_workflow_version: 1,
  pr_url: "https://github.com/acme/api/pull/7",
  status: "active",
  ...over,
});

const run = (id: string, over: Partial<CiRunItem> = {}): CiRunItem => ({
  id,
  agent_id: "a1",
  agent_name: "Security Reviewer",
  repo: "acme/api",
  pr_number: 5,
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

const q = (over: Record<string, unknown> = {}) => ({ data: undefined, isError: false, error: null, refetch: vi.fn(), ...over });
const runsQuery = (runs: CiRunItem[]) => q({ data: { runs, accepted: 0, duplicates: 0, rejected: 0 } });

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci, agents }}>
      <CiTab agent={agent} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  hooks.useCiInstallations.mockReset();
  hooks.useCiRuns.mockReset().mockReturnValue(runsQuery([]));
  hooks.mutate.mockReset();
});
afterEach(cleanup);

describe("CiTab", () => {
  it("shows the empty state and opens the wizard from Add to CI", () => {
    hooks.useCiInstallations.mockReturnValue(q({ data: [] }));
    renderTab();

    expect(screen.getByText("Not in CI yet")).toBeInTheDocument();
    expect(screen.getByText("Not active in any repo")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Add to CI" })[0]!);
    expect(screen.getByRole("dialog", { name: "wizard" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "close wizard" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists installations with status, versions, Outdated badge, last run and the active count", () => {
    hooks.useCiInstallations.mockReturnValue(
      q({
        data: [
          inst({ id: "i1", repo: "acme/api", manifest_version: 3, status: "active" }),
          inst({ id: "i2", repo: "acme/web", manifest_version: 2, status: "pending" }),
          inst({ id: "i3", repo: "acme/docs", manifest_version: 3, workflow_version: 1, status: "active", pr_url: null }),
        ],
      }),
    );
    hooks.useCiRuns.mockReturnValue(
      runsQuery([
        run("new", { repo: "acme/api", verdict: "fail", ran_at: "2026-10-02T10:00:00Z" }),
        run("old", { repo: "acme/api", verdict: "pass", ran_at: "2026-10-01T10:00:00Z" }),
        run("other-agent", { agent_id: "a2", repo: "acme/docs", verdict: "fail" }),
      ]),
    );
    renderTab();

    expect(screen.getByText("Active in 2 repos")).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "CI installations" })).getAllByRole("listitem");
    expect(rows).toHaveLength(3);

    // current installation: no Outdated badge, newest run of THIS agent in that repo
    expect(within(rows[0]!).getByText("acme/api")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Active")).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/agent v3 · workflow v1/)).toBeInTheDocument();
    expect(within(rows[0]!).queryByText("Outdated")).not.toBeInTheDocument();
    expect(within(rows[0]!).getByText(/^Last run .* · Blocked$/)).toBeInTheDocument();

    // exported at an older agent version: Outdated, pending, link to the open PR, no runs
    expect(within(rows[1]!).getByText("Outdated")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Pending merge")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("No runs yet")).toBeInTheDocument();
    expect(within(rows[1]!).getByRole("link", { name: "View pull request" })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/pull/7",
    );

    // another agent's run in acme/docs does not count as this agent's last run
    expect(within(rows[2]!).getByText("No runs yet")).toBeInTheDocument();
    expect(within(rows[2]!).queryByRole("link")).not.toBeInTheDocument();

    expect(screen.getByRole("note")).toHaveTextContent(/This agent changed after it was exported/);
  });

  it("shows no outdated notice when every installation is current, and singular copy for one repo", () => {
    hooks.useCiInstallations.mockReturnValue(q({ data: [inst()] }));
    renderTab();
    expect(screen.getByText("Active in 1 repo")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("calls the update mutation when Fail CI on changes", () => {
    hooks.useCiInstallations.mockReturnValue(q({ data: [] }));
    renderTab();
    const select = screen.getByLabelText(/CI gate/);
    expect(select).toHaveValue("critical");
    fireEvent.change(select, { target: { value: "any" } });
    expect(hooks.mutate).toHaveBeenCalledWith({ id: "a1", patch: { ci_fail_on: "any" } });
  });

  it("shows the agent's run history only, or an empty note", () => {
    hooks.useCiInstallations.mockReturnValue(q({ data: [] }));
    hooks.useCiRuns.mockReturnValue(
      runsQuery([run("mine", { pr_number: 5 }), run("theirs", { agent_id: "a2", agent_name: "Other", pr_number: 9 })]),
    );
    const { unmount } = renderTab();
    const history = screen.getByRole("region", { name: "Run history" });
    expect(within(history).getAllByRole("row")).toHaveLength(2);
    expect(within(history).getByText("#5")).toBeInTheDocument();
    expect(within(history).queryByText("#9")).not.toBeInTheDocument();
    unmount();

    hooks.useCiRuns.mockReturnValue(runsQuery([run("theirs", { agent_id: "a2" })]));
    renderTab();
    expect(screen.getByText("No CI runs for this agent yet.")).toBeInTheDocument();
  });

  it("shows a loading state, then an error with a retry that refetches", () => {
    hooks.useCiInstallations.mockReturnValue(q());
    const { unmount } = renderTab();
    expect(screen.getByRole("status", { name: "Loading installations" })).toBeInTheDocument();
    unmount();

    const refetch = vi.fn();
    hooks.useCiInstallations.mockReturnValue(q({ isError: true, error: new ApiError("db down", 500), refetch }));
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent("db down");
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows an error for the run history with its own retry", () => {
    hooks.useCiInstallations.mockReturnValue(q({ data: [] }));
    const refetch = vi.fn();
    hooks.useCiRuns.mockReturnValue(q({ isError: true, refetch }));
    renderTab();
    const history = screen.getByRole("region", { name: "Run history" });
    expect(within(history).getByRole("alert")).toHaveTextContent("Couldn't load CI runs");
    fireEvent.click(within(history).getByRole("button", { name: /retry|try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
