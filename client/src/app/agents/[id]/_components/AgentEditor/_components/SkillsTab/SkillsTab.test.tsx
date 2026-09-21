import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

const mutate = vi.fn();
const mk = (id: string, enabled = true): Skill => ({
  id,
  name: id,
  description: `${id} desc`,
  type: "rubric",
  source: "manual",
  body: "b",
  enabled,
  version: 1,
});
const SKILLS = [mk("alpha"), mk("beta"), mk("gamma", false), mk("delta")];
// Link order: beta (enabled), alpha (linked but off for this agent).
const LINKS = [
  { agent_id: "ag1", skill_id: "alpha", order: 1, enabled: false },
  { agent_id: "ag1", skill_id: "beta", order: 0, enabled: true },
];
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS }),
  useAgentSkills: () => ({ data: LINKS }),
  useSetAgentSkills: () => ({ mutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

const AGENT = { id: "ag1" } as Agent;
const renderTab = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>
        <SkillsTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
const order = () => screen.getAllByRole("listitem").map((li) => li.getAttribute("data-testid"));

describe("SkillsTab", () => {
  it("lists every skill, linked first, with an enabled counter", () => {
    renderTab();
    expect(order()).toEqual(["skill-row-beta", "skill-row-alpha", "skill-row-gamma", "skill-row-delta"]);
    expect(screen.getByText("1 of 4 enabled")).toBeInTheDocument();
    expect(screen.getByText("disabled globally")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")[2]).toBeDisabled();
  });

  it("toggles a checkbox and updates the counter", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(screen.getByText("2 of 4 enabled")).toBeInTheDocument();
  });

  it("reorders with the move buttons", () => {
    renderTab();
    fireEvent.click(screen.getByLabelText("Move alpha up"));
    expect(order().slice(0, 2)).toEqual(["skill-row-alpha", "skill-row-beta"]);
  });

  it("filters by name", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "del" } });
    expect(order()).toEqual(["skill-row-delta"]);
  });

  it("saves ONE ordered list of the checked skills", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("checkbox")[3]!); // delta
    fireEvent.click(screen.getByLabelText("Move delta up"));
    fireEvent.click(screen.getByText("Save skills"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({
      agentId: "ag1",
      skills: [
        { skill_id: "beta", enabled: true },
        { skill_id: "delta", enabled: true },
      ],
    });
  });
});
