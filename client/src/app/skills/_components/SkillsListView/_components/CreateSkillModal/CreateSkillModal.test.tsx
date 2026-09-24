import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";
import { CreateSkillModal } from "./CreateSkillModal";

const createMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: createMutate, isPending: false }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <CreateSkillModal onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

describe("CreateSkillModal", () => {
  it("is a dialog with name, description, type and a markdown body", () => {
    setup();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Create a skill")).toBeInTheDocument();
    for (const label of ["Name", "Description", "Type", "Skill body (Markdown)"]) {
      expect(screen.getByText(new RegExp(`^${label.replace(/[()]/g, "\\$&")}`))).toBeInTheDocument();
    }
  });

  it("Create is disabled until a name is typed", () => {
    setup();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), { target: { value: "x" } });
    expect(screen.getByRole("button", { name: "Create skill" })).toBeEnabled();
  });

  it("submits the trimmed name with the chosen fields, then closes", async () => {
    createMutate.mockResolvedValue({});
    const onClose = setup();
    fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), { target: { value: "  my-rule  " } });
    fireEvent.change(screen.getAllByRole("textbox")[2]!, { target: { value: "# Rule" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith({ name: "my-rule", description: "", type: "custom", body: "# Rule" }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows a name clash (409) inline and stays open", async () => {
    createMutate.mockRejectedValue(new Error('A skill named "my-rule" already exists'));
    const onClose = setup();
    fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), { target: { value: "my-rule" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cancel closes without creating", () => {
    const onClose = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
  });
});
