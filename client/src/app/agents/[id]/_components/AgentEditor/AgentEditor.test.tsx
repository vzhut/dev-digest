import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
const mutate = vi.fn();
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("resets the form when switching to another agent", () => {
    const view = renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Edited name" } });
    expect(screen.getByDisplayValue("Edited name")).toBeInTheDocument();

    const other: Agent = { ...AGENT, id: "ag2", name: "Style Reviewer", description: "Nits" };
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <ToastProvider>
          <AgentEditor agent={other} tab="config" onTab={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByDisplayValue("Style Reviewer")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Edited name")).not.toBeInTheDocument();
  });

  it("saves the edited form as the agent patch", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Edited name" } });
    fireEvent.click(screen.getByText("Save agent"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({
      id: "ag1",
      patch: {
        name: "Edited name",
        description: AGENT.description,
        provider: AGENT.provider,
        model: AGENT.model,
        system_prompt: AGENT.system_prompt,
        strategy: AGENT.strategy,
        ci_fail_on: AGENT.ci_fail_on,
        repo_intel: AGENT.repo_intel,
        enabled: AGENT.enabled,
      },
    });
  });
});
