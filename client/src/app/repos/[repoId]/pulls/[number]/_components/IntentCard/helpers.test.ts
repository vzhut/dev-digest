import { describe, it, expect } from "vitest";
import type { IntentSource } from "@devdigest/shared";
import { formatIntentMeta, hasFixedLabel, riskAreasOf, sourceSummary } from "./helpers";

const src = (kind: IntentSource["kind"], status: IntentSource["status"], ref = "x"): IntentSource => ({
  kind,
  ref,
  status,
  chars: 1,
});

describe("IntentCard helpers", () => {
  it("splits sources into loaded and unavailable", () => {
    const { loaded, unavailable } = sourceSummary([
      src("pr_title", "used"),
      src("github_issue", "truncated", "#12"),
      src("repo_file", "missing", "specs/a.md"),
      src("external_ticket", "blocked", "jira/ABC-1"),
    ]);
    expect(loaded.map((x) => x.kind)).toEqual(["pr_title", "github_issue"]);
    expect(unavailable.map((x) => x.ref)).toEqual(["specs/a.md", "jira/ABC-1"]);
  });

  it("labels title/description/files/hunks by kind and issues/specs/tickets by ref", () => {
    expect(hasFixedLabel(src("pr_description", "used"))).toBe(true);
    expect(hasFixedLabel(src("github_issue", "used"))).toBe(false);
  });

  it("formats model and cost; unknown cost stays a dash, zero is a real number", () => {
    expect(formatIntentMeta({ model: "deepseek/deepseek-v4-flash", cost_usd: 0.00031 })).toEqual({
      model: "deepseek-v4-flash",
      cost: "$0.0003",
    });
    expect(formatIntentMeta({ model: null, cost_usd: null })).toEqual({ model: null, cost: "—" });
    expect(formatIntentMeta({ model: "m", cost_usd: 0 }).cost).toBe("$0.0000");
  });

  it("treats missing or blank risk areas as none", () => {
    expect(riskAreasOf({ risk_areas: undefined })).toEqual([]);
    expect(riskAreasOf({ risk_areas: null })).toEqual([]);
    expect(riskAreasOf({ risk_areas: ["webhooks", "  "] })).toEqual(["webhooks"]);
  });

  it("drops repeated risk areas (they are React keys) and trims", () => {
    expect(riskAreasOf({ risk_areas: ["webhooks", " webhooks ", "config"] })).toEqual(["webhooks", "config"]);
  });
});
