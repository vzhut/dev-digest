import { describe, it, expect } from "vitest";
import type { Agent, AgentRunEstimate } from "@devdigest/shared";
import { enabledAgents, estimatesFor, toggleId } from "./agent-selection";

const agent = (id: string, enabled: boolean) => ({ id, name: id, enabled }) as Agent;

describe("agent-selection", () => {
  it("enabledAgents keeps only enabled agents in order and tolerates undefined", () => {
    const list = [agent("a", true), agent("b", false), agent("c", true)];
    expect(enabledAgents(list).map((a) => a.id)).toEqual(["a", "c"]);
    expect(enabledAgents(undefined)).toEqual([]);
  });

  it("toggleId adds and removes without mutating the input set", () => {
    const base: ReadonlySet<string> = new Set(["a"]);
    const added = toggleId(base, "b");
    expect([...added].sort()).toEqual(["a", "b"]);
    expect([...base]).toEqual(["a"]);
    expect([...toggleId(added, "a")]).toEqual(["b"]);
  });

  it("estimatesFor returns only the rows of the checked agents", () => {
    const rows: AgentRunEstimate[] = [
      { agent_id: "a", est_duration_ms: 1000, est_cost_usd: 0.1 },
      { agent_id: "b", est_duration_ms: null, est_cost_usd: null },
      { agent_id: "c", est_duration_ms: 3000, est_cost_usd: 0.3 },
    ];
    expect(estimatesFor(["a", "c", "missing"], rows).map((e) => e.agent_id)).toEqual(["a", "c"]);
    expect(estimatesFor(["a"], undefined)).toEqual([]);
  });
});
