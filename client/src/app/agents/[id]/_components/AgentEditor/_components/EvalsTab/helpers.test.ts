import { describe, it, expect } from "vitest";
import type { EvalSuiteRun } from "@devdigest/shared";
import { latestFinished, latestTwoCompleted } from "./helpers";

const run = (id: string, ran_at: string, status: EvalSuiteRun["status"] = "completed") => ({ id, ran_at, status }) as EvalSuiteRun;

describe("latestTwoCompleted / latestFinished", () => {
  it("pick by ran_at, not by the order the server returned the runs in", () => {
    const oldestFirst = [run("r1", "2026-10-01T00:00:00Z"), run("r3", "2026-10-03T00:00:00Z"), run("r2", "2026-10-02T00:00:00Z")];
    expect(latestTwoCompleted(oldestFirst)).toMatchObject({ latest: { id: "r3" }, previous: { id: "r2" } });
    expect(latestFinished(oldestFirst)?.id).toBe("r3");
  });

  it("ignores a running run for the tiles and for the finished one", () => {
    const runs = [run("run", "2026-10-09T00:00:00Z", "running"), run("r1", "2026-10-01T00:00:00Z"), run("e", "2026-10-05T00:00:00Z", "errored")];
    expect(latestTwoCompleted(runs).latest?.id).toBe("r1");
    expect(latestTwoCompleted(runs).previous).toBeUndefined();
    expect(latestFinished(runs)?.id).toBe("e"); // errored counts as finished
    expect(latestFinished([run("run", "2026-10-09T00:00:00Z", "running")])).toBeUndefined();
  });
});
