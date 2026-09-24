import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skillsMessages from "../../../../../messages/en/skills.json";
import common from "../../../../../messages/en/common.json";

const push = vi.fn();
const deleteMutate = vi.fn();
const SKILLS: Skill[] = [
  { id: "s1", name: "alpha", description: "a", type: "rubric", source: "manual", body: "x", enabled: true, version: 1, agent_count: 2 },
  { id: "s2", name: "beta", description: "b", type: "custom", source: "manual", body: "y", enabled: true, version: 4, agent_count: 0 },
];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("./_components/AddSkillDrawer", () => ({
  AddSkillDrawer: ({ open }: { open: boolean }) => (open ? <div data-testid="import-drawer" /> : null),
}));
vi.mock("./_components/CreateSkillModal", () => ({
  CreateSkillModal: () => <div role="dialog" aria-label="create-skill" />,
}));
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { SkillsListView } from "./SkillsListView";

afterEach(() => {
  cleanup();
  push.mockReset();
  deleteMutate.mockReset();
});

const wrap = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, common }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("SkillsListView delete", () => {
  it("Delete on a card opens a confirm modal; cancel deletes nothing", () => {
    wrap(<SkillsListView />);
    fireEvent.click(screen.getByRole("button", { name: "Delete skill alpha" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Delete skill "alpha"/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("confirming deletes that skill; deleting the open one returns to /skills", () => {
    deleteMutate.mockImplementation((_id: string, opts: { onSuccess: () => void }) => opts.onSuccess());
    wrap(<SkillsListView activeId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete skill alpha" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("s1", expect.anything());
    expect(push).toHaveBeenCalledWith("/skills");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("deleting a skill that is not open does not navigate", () => {
    deleteMutate.mockImplementation((_id: string, opts: { onSuccess: () => void }) => opts.onSuccess());
    wrap(<SkillsListView activeId="s1" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete skill beta" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("s2", expect.anything());
    expect(push).not.toHaveBeenCalled();
  });
});

describe("SkillsListView add menu", () => {
  it("Add Skill offers Create and Import; Create opens the modal, Import the drawer", () => {
    wrap(<SkillsListView />);
    expect(screen.queryByText("Import from file")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Add Skill/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByRole("dialog", { name: "create-skill" })).toBeInTheDocument();
    expect(screen.queryByTestId("import-drawer")).toBeNull();
  });

  it("Import opens the drawer, not the create modal", () => {
    wrap(<SkillsListView />);
    fireEvent.click(screen.getByRole("button", { name: /Add Skill/ }));
    fireEvent.click(screen.getByRole("button", { name: "Import from file" }));
    expect(screen.getByTestId("import-drawer")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "create-skill" })).toBeNull();
  });
});
