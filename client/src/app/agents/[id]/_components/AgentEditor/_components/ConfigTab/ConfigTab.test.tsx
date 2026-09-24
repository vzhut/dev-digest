/**
 * ConfigTab — the form is local state seeded from the agent (the parent keys
 * this component by agent.id, so a remount is the reset). Save sends exactly
 * the editable fields as the patch; an empty model list means "provider key
 * missing" and must say so instead of showing a silent dropdown.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import type { AgentForm } from "./helpers";
import messages from "../../../../../../../../messages/en/agents.json";

const mutate = vi.fn();
type ModelRow = { id: string };
const models = vi.fn(() => ({ data: [{ id: "openai/gpt-4.1" }] as ModelRow[] | undefined }));

vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => models(),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { ConfigTab } from "./ConfigTab";

const AGENT: Agent = {
  id: "a1",
  name: "Security Reviewer",
  description: "Finds vulnerabilities",
  provider: "openrouter",
  model: "openai/gpt-4.1",
  system_prompt: "You review code.",
  enabled: true,
  version: 3,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
};

function renderTab(agent: Agent = AGENT) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ConfigTab agent={agent} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mutate.mockReset();
  models.mockReturnValue({ data: [{ id: "openai/gpt-4.1" }] });
});
afterEach(cleanup);

describe("ConfigTab", () => {
  it("seeds the form from the agent", () => {
    renderTab();
    expect(screen.getByDisplayValue("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Finds vulnerabilities")).toBeInTheDocument();
    expect(screen.getByDisplayValue("You review code.")).toBeInTheDocument();
  });

  it("saves the edited fields as one patch, without the agent's read-only columns", () => {
    renderTab();
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const { id, patch } = mutate.mock.calls[0]![0] as { id: string; patch: AgentForm };
    expect(id).toBe("a1");
    expect(patch).toEqual({
      name: "Renamed",
      description: "Finds vulnerabilities",
      provider: "openrouter",
      model: "openai/gpt-4.1",
      system_prompt: "You review code.",
      strategy: "single-pass",
      ci_fail_on: "critical",
      repo_intel: true,
      enabled: true,
    });
    expect(patch).not.toHaveProperty("version");
    expect(patch).not.toHaveProperty("id");
  });

  it("a remount with another agent starts from that agent's values (the keyed reset)", () => {
    const { unmount } = renderTab();
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Dirty" } });
    unmount();

    renderTab({ ...AGENT, id: "a2", name: "Style Reviewer" });
    expect(screen.getByDisplayValue("Style Reviewer")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Dirty")).not.toBeInTheDocument();
  });

  it("explains an empty model list instead of showing a silent dropdown", () => {
    models.mockReturnValue({ data: [] });
    renderTab();
    expect(screen.getByText(/no models/i)).toBeInTheDocument();
  });
});
