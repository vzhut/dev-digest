import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillStats } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { StatsTab } from "./StatsTab";

const useSkillStats = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({ useSkillStats: (id: string) => useSkillStats(id) }));

afterEach(() => {
  cleanup();
  useSkillStats.mockReset();
});

const BASE: SkillStats = {
  used_by: 2,
  agents: [
    { id: "a1", name: "Security Reviewer", enabled: true },
    { id: "a2", name: "Style Reviewer", enabled: false },
  ],
  runs_30d: 5,
  findings_30d: 12,
  accept_rate: 0.5,
  findings_by_category: [{ category: "security", count: 7 }],
};

function renderTab(stats: SkillStats) {
  useSkillStats.mockReturnValue({ data: stats, isLoading: false, isError: false });
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <StatsTab skillId="s1" />
    </NextIntlClientProvider>,
  );
}

describe("StatsTab", () => {
  it("renders tiles, agents with enabled state, caveat and categories", () => {
    renderTab(BASE);
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText(/not a per-skill attribution/)).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.queryByText(/pull frequency/i)).not.toBeInTheDocument();
  });

  it("shows — for a null accept rate, never 0%", () => {
    renderTab({ ...BASE, accept_rate: null });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows the empty state instead of zeros when there are no runs", () => {
    renderTab({ ...BASE, runs_30d: 0, findings_30d: 0, accept_rate: null, findings_by_category: [] });
    expect(screen.getByText("No runs with this skill yet")).toBeInTheDocument();
    expect(screen.queryByText("RUNS (30d)")).not.toBeInTheDocument();
  });
});
