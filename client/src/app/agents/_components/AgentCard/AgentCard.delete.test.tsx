import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import common from "../../../../../messages/en/common.json";

const del = vi.fn();
vi.mock("@/lib/hooks/agents", () => ({ useDeleteAgent: () => ({ mutate: del, isPending: false }) }));

import { AgentCard } from "./AgentCard";

afterEach(() => {
  cleanup();
  del.mockReset();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "d",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "p",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const wrap = (onClick = vi.fn()) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, common }}>
      <AgentCard ag={AGENT} onClick={onClick} />
    </NextIntlClientProvider>,
  );

describe("AgentCard delete", () => {
  it("opens a confirm modal (not window.confirm); cancel keeps the agent", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const onClick = vi.fn();
    wrap(onClick);
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(del).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("confirm deletes the agent", () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(del).toHaveBeenCalledWith("ag1", expect.anything());
  });
});
