import { describe, expect, it } from "vitest";
import { NAV } from "@devdigest/ui/nav";

const keysOf = (section: string) => NAV.find((g) => g.section === section)?.items.map((i) => i.key) ?? [];

describe("sidebar NAV", () => {
  it("puts Skills and Agents in SKILLS LAB, not WORKSPACE", () => {
    expect(keysOf("SKILLS LAB")).toEqual(["skills", "agents"]);
    expect(keysOf("WORKSPACE")).not.toContain("agents");
    expect(keysOf("WORKSPACE")).toContain("pulls");
  });

  it("keeps item keys and g-shortcuts unique", () => {
    const items = NAV.flatMap((g) => g.items);
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
    const g = items.map((i) => i.gKey).filter(Boolean);
    expect(new Set(g).size).toBe(g.length);
  });
});
