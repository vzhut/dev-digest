import { describe, expect, it } from "vitest";
import { NAV } from "@devdigest/ui/nav";
import { activeKeyFor } from "./helpers";

const keysOf = (section: string) => NAV.find((g) => g.section === section)?.items.map((i) => i.key) ?? [];

describe("sidebar NAV", () => {
  it("puts Skills, Agents, Conventions and Eval Dashboard in SKILLS LAB, not WORKSPACE", () => {
    expect(keysOf("SKILLS LAB")).toEqual(["skills", "agents", "conventions", "eval"]);
    expect(keysOf("WORKSPACE")).not.toContain("agents");
    expect(keysOf("WORKSPACE")).toEqual(["pulls", "onboarding-tour", "context"]);
  });

  it("keeps item keys and g-shortcuts unique", () => {
    const items = NAV.flatMap((g) => g.items);
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
    const g = items.map((i) => i.gKey).filter(Boolean);
    expect(new Set(g).size).toBe(g.length);
  });

  it("highlights Eval Dashboard on its page and on a per-agent view, and links to /eval", () => {
    const item = NAV.flatMap((g) => g.items).find((i) => i.key === "eval");
    expect(item).toMatchObject({ label: "Eval Dashboard", href: "/eval" });
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/eval/agents/abc")).toBe("eval");
    expect(activeKeyFor("/agents/abc")).toBe("agents");
  });
});
