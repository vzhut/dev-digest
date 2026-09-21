import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import common from "../../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const mutate = vi.fn();
const deleteMutate = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { ConfigTab } from "./ConfigTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  deleteMutate.mockReset();
});

const SKILL: Skill = {
  id: "s1",
  name: "pr-rubric",
  description: "Apply when a PR touches auth",
  type: "rubric",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 2,
};

const wrap = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, common }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );

describe("Skill ConfigTab", () => {
  it("shows the directive-description help text", () => {
    wrap(<ConfigTab skill={SKILL} />);
    expect(screen.getByText(/when does this skill apply/i)).toBeInTheDocument();
  });

  it("hides the version message until something changes, and Save is disabled", () => {
    wrap(<ConfigTab skill={SKILL} />);
    expect(screen.queryByText("Version message (optional)")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    expect(screen.getByText("Save skill").closest("button")).toBeDisabled();
  });

  it("shows the optional message once dirty and saves without it", () => {
    wrap(<ConfigTab skill={SKILL} />);
    fireEvent.change(screen.getByDisplayValue("pr-rubric"), { target: { value: "renamed" } });
    expect(screen.getByText("Version message (optional)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Save skill"));
    expect(mutate).toHaveBeenCalledTimes(1);
    const patch = mutate.mock.calls[0]?.[0].patch;
    expect(patch).toMatchObject({ name: "renamed", body: "# Rule" });
    expect(patch).not.toHaveProperty("message");
  });

  it("sends the trimmed message when provided, omits it when blank", () => {
    wrap(<ConfigTab skill={SKILL} />);
    fireEvent.change(screen.getByDisplayValue("pr-rubric"), { target: { value: "renamed" } });
    fireEvent.change(screen.getByPlaceholderText(/Tighten the auth check/), { target: { value: " rename for clarity " } });
    fireEvent.click(screen.getByText("Save skill"));
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({
      id: "s1",
      patch: { name: "renamed", body: "# Rule", message: "rename for clarity" },
    });
    mutate.mockReset();
    fireEvent.change(screen.getByPlaceholderText(/Tighten the auth check/), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Save skill"));
    expect(mutate.mock.calls[0]?.[0].patch).not.toHaveProperty("message");
  });

  it("blocks saving a blank name", () => {
    wrap(<ConfigTab skill={SKILL} />);
    fireEvent.change(screen.getByDisplayValue("pr-rubric"), { target: { value: "  " } });
    expect(screen.getByText("Save skill").closest("button")).toBeDisabled();
  });

  it("Cancel reverts the form to the saved values", () => {
    wrap(<ConfigTab skill={SKILL} />);
    fireEvent.change(screen.getByDisplayValue("pr-rubric"), { target: { value: "renamed" } });
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByDisplayValue("pr-rubric")).toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    expect(screen.queryByText("Version message (optional)")).not.toBeInTheDocument();
  });

  it("shows the unsaved badge and snapshot hint only when the body changed", () => {
    wrap(<ConfigTab skill={SKILL} />);
    fireEvent.change(screen.getByDisplayValue("pr-rubric"), { target: { value: "renamed" } });
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    expect(screen.queryByText(/Saving snapshots the body/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("# Rule"), { target: { value: "# Rule\nmore" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText(/Saving snapshots the body/)).toBeInTheDocument();
  });

  it("delete asks in a modal first: cancel keeps the skill, confirm deletes it", () => {
    wrap(<ConfigTab skill={SKILL} />);
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(deleteMutate).toHaveBeenCalledWith("s1", expect.anything());
  });
});
