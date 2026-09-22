import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

const mutate = vi.fn();
const mk = (id: string, enabled = true, type: Skill["type"] = "rubric"): Skill => ({
  id,
  name: id,
  description: `${id} desc`,
  type,
  source: "manual",
  body: "b",
  enabled,
  version: 1,
});
const SKILLS = [mk("alpha", true, "convention"), mk("beta", true, "security"), mk("gamma", false, "custom"), mk("delta")];
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

  it("reorders enabled rows with the move buttons", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("checkbox")[1]!); // alpha becomes enabled
    fireEvent.click(screen.getByLabelText("Move alpha up"));
    expect(order().slice(0, 2)).toEqual(["skill-row-alpha", "skill-row-beta"]);
  });

  it("shows every skill's type label, including disabled ones", () => {
    renderTab();
    const row = (id: string) => screen.getByTestId(`skill-row-${id}`);
    expect(row("alpha")).toHaveTextContent("convention");
    expect(row("beta")).toHaveTextContent("security");
    expect(row("gamma")).toHaveTextContent("custom");
    expect(row("delta")).toHaveTextContent("rubric");
  });

  it("only enabled rows are draggable (checked AND globally enabled)", () => {
    renderTab();
    const draggable = (id: string) => screen.getByTestId(`skill-row-${id}`).getAttribute("draggable");
    expect(draggable("beta")).toBe("true"); // checked, enabled
    expect(draggable("alpha")).toBe("false"); // linked but unchecked for this agent
    expect(draggable("gamma")).toBe("false"); // disabled globally
    expect(draggable("delta")).toBe("false"); // not linked
    fireEvent.click(screen.getAllByRole("checkbox")[3]!); // check delta
    expect(draggable("delta")).toBe("true");
  });

  it("hides the move buttons on rows that are not enabled", () => {
    renderTab();
    expect(screen.queryByLabelText("Move alpha up")).toBeNull();
    expect(screen.getByLabelText("Move beta down")).toBeInTheDocument();
  });

  it("drag and drop reorders enabled rows and is a no-op onto a disabled row", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("checkbox")[3]!); // delta enabled -> beta, alpha(off), gamma, delta
    const beta = screen.getByTestId("skill-row-beta");
    const delta = screen.getByTestId("skill-row-delta");
    const alpha = screen.getByTestId("skill-row-alpha");

    fireEvent.dragStart(beta);
    fireEvent.dragOver(alpha); // disabled target
    fireEvent.drop(alpha);
    expect(order()[0]).toBe("skill-row-beta");
    expect(order().indexOf("skill-row-alpha")).toBe(1);

    fireEvent.dragStart(delta);
    fireEvent.dragOver(beta);
    fireEvent.drop(beta);
    expect(order()[0]).toBe("skill-row-delta");
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
