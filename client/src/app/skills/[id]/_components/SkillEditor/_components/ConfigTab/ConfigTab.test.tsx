import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const mutate = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ConfigTab } from "./ConfigTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
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
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );

describe("Skill ConfigTab", () => {
  it("shows the directive-description help text", () => {
    wrap(<ConfigTab skill={SKILL} />);
    expect(screen.getByText(/when does this skill apply/i)).toBeInTheDocument();
  });

  it("saves the edited form", () => {
    wrap(<ConfigTab skill={SKILL} />);
    fireEvent.change(screen.getByDisplayValue("pr-rubric"), { target: { value: "renamed" } });
    fireEvent.click(screen.getByText("Save skill"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({ id: "s1", patch: { name: "renamed", body: "# Rule" } });
  });
});
