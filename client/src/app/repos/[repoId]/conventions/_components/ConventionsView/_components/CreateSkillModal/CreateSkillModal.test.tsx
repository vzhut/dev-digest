import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/conventions.json";
import { ApiError } from "@/lib/api";
import { CreateSkillModal } from "./CreateSkillModal";

const DRAFT = {
  name: "repo-conventions",
  description: "1 house conventions extracted from acme/api",
  type: "convention" as const,
  body: "# repo-conventions\n\n## use-async-await\nUse async/await, not .then()",
  evidence_files: ["src/a.ts"],
  count: 1,
};

const { draftMutate, createMutateAsync, updateMutateAsync, linkMutateAsync, push, success } = vi.hoisted(() => ({
  draftMutate: vi.fn(),
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
  linkMutateAsync: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
}));
draftMutate.mockImplementation((_: unknown, opts?: { onSuccess?: (d: typeof DRAFT) => void }) => {
  opts?.onSuccess?.(DRAFT);
});

vi.mock("@/lib/hooks/conventions", () => ({
  useSkillDraft: () => ({ mutate: draftMutate }),
  useCreateConventionSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useLinkSkillToAgent: () => ({ mutateAsync: linkMutateAsync, isPending: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "API Contract Reviewer" }, { id: "a2", name: "Security" }] }),
}));
vi.mock("@/lib/toast", () => ({ notify: { success } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CreateSkillModal repoId="repo-1" onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

describe("CreateSkillModal", () => {
  it("prefills name/description/body from the skill-draft, and lists agents to attach", async () => {
    setup();
    expect(await screen.findByDisplayValue("repo-conventions")).toBeInTheDocument();
    expect(screen.getByDisplayValue(DRAFT.description)).toBeInTheDocument();
    // order: Name, Description, Skill body.
    expect(screen.getAllByRole("textbox")[2]).toHaveValue(DRAFT.body);
    expect(screen.getByText("API Contract Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
  });

  it("submits with the selected agent, toasts, closes, and deep-links to the agent's Skills tab", async () => {
    createMutateAsync.mockResolvedValue({ skill: { id: "s1", name: "repo-conventions" }, agent_ids_linked: ["a1"] });
    const onClose = setup();
    await screen.findByDisplayValue("repo-conventions");
    fireEvent.click(screen.getByText("API Contract Reviewer"));
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "repo-conventions", agent_ids: ["a1"] }),
      ),
    );
    expect(success).toHaveBeenCalledWith('Skill "repo-conventions" created');
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/agents/a1?tab=skills");
  });

  it("a name clash (409) offers Update existing skill instead of a generic error", async () => {
    createMutateAsync.mockRejectedValue(
      new ApiError('A skill named "repo-conventions" already exists', 409, "conflict", { existing_skill_id: "existing-1" }),
    );
    updateMutateAsync.mockResolvedValue({});
    const onClose = setup();
    await screen.findByDisplayValue("repo-conventions");
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    fireEvent.click(screen.getByRole("button", { name: "Update existing skill" }));

    await waitFor(() =>
      expect(updateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: "existing-1" }),
      ),
    );
    expect(success).toHaveBeenCalledWith("Skill updated");
    expect(onClose).toHaveBeenCalled();
  });

  it("Cancel closes without creating", async () => {
    const onClose = setup();
    await screen.findByDisplayValue("repo-conventions");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });
});
