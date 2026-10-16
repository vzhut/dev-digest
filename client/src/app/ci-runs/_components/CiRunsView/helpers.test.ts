import { describe, expect, it } from "vitest";
import type { CiRunItem } from "@devdigest/shared";
import { agentOptions, filterRuns, newestFirst, NO_FILTERS, repoOptions } from "./helpers";

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
  cost_usd: null,
  duration_ms: null,
  ran_at: "2026-10-01T10:00:00Z",
  job_url: "https://github.com/acme/api/actions/runs/1",
  ...over,
});

describe("newestFirst", () => {
  it("orders by finish time descending without mutating the input", () => {
    const input = [
      run("old", { ran_at: "2026-10-01T10:00:00Z" }),
      run("new", { ran_at: "2026-10-03T10:00:00Z" }),
      run("mid", { ran_at: "2026-10-02T10:00:00Z" }),
    ];
    expect(newestFirst(input).map((r) => r.id)).toEqual(["new", "mid", "old"]);
    expect(input.map((r) => r.id)).toEqual(["old", "new", "mid"]);
  });
});

describe("filterRuns", () => {
  const runs = [
    run("1", { agent_id: "a1", repo: "acme/api" }),
    run("2", { agent_id: "a2", repo: "acme/api" }),
    run("3", { agent_id: "a1", repo: "acme/web" }),
    run("4", { agent_id: null, repo: "acme/web" }),
  ];

  it("returns everything for the empty filters", () => {
    expect(filterRuns(runs, NO_FILTERS)).toHaveLength(4);
  });

  it("narrows by agent, by repo, and by both together", () => {
    expect(filterRuns(runs, { agentId: "a1", repo: "" }).map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterRuns(runs, { agentId: "", repo: "acme/web" }).map((r) => r.id)).toEqual(["3", "4"]);
    expect(filterRuns(runs, { agentId: "a1", repo: "acme/web" }).map((r) => r.id)).toEqual(["3"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterRuns(runs, { agentId: "a2", repo: "acme/web" })).toEqual([]);
  });
});

describe("agentOptions", () => {
  it("lists distinct agents sorted by name and skips runs of a deleted agent", () => {
    const runs = [
      run("1", { agent_id: "a2", agent_name: "Zeta" }),
      run("2", { agent_id: "a1", agent_name: "Alpha" }),
      run("3", { agent_id: "a2", agent_name: "Zeta" }),
      run("4", { agent_id: null, agent_name: "Ghost" }),
    ];
    expect(agentOptions(runs)).toEqual([
      { value: "a1", label: "Alpha" },
      { value: "a2", label: "Zeta" },
    ]);
  });
});

describe("repoOptions", () => {
  it("lists distinct repos in alphabetical order", () => {
    const runs = [run("1", { repo: "b/two" }), run("2", { repo: "a/one" }), run("3", { repo: "b/two" })];
    expect(repoOptions(runs)).toEqual([
      { value: "a/one", label: "a/one" },
      { value: "b/two", label: "b/two" },
    ]);
  });
});
