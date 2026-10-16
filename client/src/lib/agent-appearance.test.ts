import { describe, it, expect } from "vitest";
import { agentAppearance } from "./agent-appearance";

describe("agentAppearance", () => {
  it("maps known role keywords (case-insensitive) to their icon and colour", () => {
    expect(agentAppearance({ name: "Security Reviewer" })).toEqual({ icon: "Shield", color: "#ef4444" });
    expect(agentAppearance({ name: "PERFORMANCE watcher" })).toEqual({ icon: "Zap", color: "#f59e0b" });
    expect(agentAppearance({ name: "Junior Mentor" })).toEqual({ icon: "Lightbulb", color: "#3b82f6" });
    expect(agentAppearance({ name: "Customer Advocate" })).toEqual({ icon: "Users", color: "#8b5cf6" });
    expect(agentAppearance({ name: "Architecture" })).toEqual({ icon: "Boxes", color: "#10b981" });
    expect(agentAppearance({ name: "Test Quality" })).toEqual({ icon: "FlaskConical", color: "#14b8a6" });
  });

  it("takes the first matching rule when a name carries several keywords", () => {
    expect(agentAppearance({ name: "Security Performance" }).icon).toBe("Shield");
  });

  it("falls back to the Cpu icon with a palette colour that is stable per id", () => {
    const palette = ["#6366f1", "#ec4899", "#0ea5e9", "#84cc16", "#f97316", "#a855f7"];
    const a = agentAppearance({ id: "agent-42", name: "Zebra" });
    expect(a.icon).toBe("Cpu");
    expect(palette).toContain(a.color);
    // Same id => same look, even when the display name differs.
    expect(agentAppearance({ id: "agent-42", name: "Renamed Zebra" })).toEqual(a);
    // Without an id the name is hashed instead, still deterministic.
    expect(agentAppearance({ name: "Zebra" })).toEqual(agentAppearance({ id: null, name: "Zebra" }));
  });

  it("spreads different ids over more than one palette colour", () => {
    const colors = new Set(
      Array.from({ length: 30 }, (_, i) => agentAppearance({ id: `id-${i}`, name: "Unknown" }).color),
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});
