import { describe, expect, it } from "vitest";
import type { CiInstallation, CiRunItem } from "@devdigest/shared";
import { activeCount, isOutdated, lastRunIn, runsOfAgent } from "./helpers";

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
  pr_url: null,
  status: "active",
  ...over,
});

const run = (id: string, agent_id: string | null, repo: string): CiRunItem => ({
  id,
  agent_id,
  agent_name: "Reviewer",
  repo,
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
  ran_at: "2026-10-01T00:00:00Z",
  job_url: "https://github.com/acme/api/actions/runs/1",
});

describe("isOutdated", () => {
  it("is false when both versions are current", () => {
    expect(isOutdated(inst({ manifest_version: 3, workflow_version: 1 }), 3)).toBe(false);
  });

  it("is true when the agent moved past the exported manifest version", () => {
    expect(isOutdated(inst({ manifest_version: 3 }), 4)).toBe(true);
  });

  it("is true when the workflow template is newer than the installed one", () => {
    expect(isOutdated(inst({ workflow_version: 1, current_workflow_version: 2 }), 3)).toBe(true);
  });

  it("is false when the installation is ahead of the studio", () => {
    expect(isOutdated(inst({ manifest_version: 9, workflow_version: 9, current_workflow_version: 1 }), 3)).toBe(false);
  });

  it("takes the current workflow version from the installation DTO (server-provided), not a client constant", () => {
    expect(isOutdated(inst({ workflow_version: 1, current_workflow_version: 3 }), 3)).toBe(true);
    expect(isOutdated(inst({ workflow_version: 3, current_workflow_version: 3, manifest_version: 3 }), 3)).toBe(false);
  });
});

describe("activeCount", () => {
  it("counts only active installations", () => {
    const rows = [inst({ id: "1" }), inst({ id: "2", status: "pending" }), inst({ id: "3" })];
    expect(activeCount(rows)).toBe(2);
  });

  it("is 0 for an empty list", () => {
    expect(activeCount([])).toBe(0);
  });
});

describe("runsOfAgent", () => {
  it("keeps only the agent's runs and preserves the input order", () => {
    const runs = [run("r1", "a1", "x/y"), run("r2", "a2", "x/y"), run("r3", "a1", "x/z"), run("r4", null, "x/y")];
    expect(runsOfAgent(runs, "a1").map((r) => r.id)).toEqual(["r1", "r3"]);
  });
});

describe("lastRunIn", () => {
  it("returns the first (newest) run of the repo", () => {
    const runs = [run("r1", "a1", "x/y"), run("r2", "a1", "x/z"), run("r3", "a1", "x/z")];
    expect(lastRunIn(runs, "x/z")?.id).toBe("r2");
  });

  it("returns undefined when the agent never ran there", () => {
    expect(lastRunIn([run("r1", "a1", "x/y")], "x/other")).toBeUndefined();
  });
});
