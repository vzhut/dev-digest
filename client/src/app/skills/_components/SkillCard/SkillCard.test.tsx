import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "pr-rubric",
  description: "Apply when a PR touches auth code",
  type: "rubric",
  source: "imported_url",
  body: "# x",
  enabled: true,
  version: 1,
};

const wrap = (ui: React.ReactElement) =>
  render(<NextIntlClientProvider locale="en" messages={{ skills: messages }}>{ui}</NextIntlClientProvider>);

describe("SkillCard", () => {
  it("shows name, description, type and the vetting badge for untrusted sources", () => {
    wrap(<SkillCard skill={SKILL} />);
    expect(screen.getByText("pr-rubric")).toBeInTheDocument();
    expect(screen.getByText("Apply when a PR touches auth code")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("does not flag manual skills and fires onClick", () => {
    const onClick = vi.fn();
    wrap(<SkillCard skill={{ ...SKILL, source: "manual" }} onClick={onClick} />);
    expect(screen.queryByText("needs vetting")).toBeNull();
    fireEvent.click(screen.getByText("pr-rubric"));
    expect(onClick).toHaveBeenCalled();
  });
});
