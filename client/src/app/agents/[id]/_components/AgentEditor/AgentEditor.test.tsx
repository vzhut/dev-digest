import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import evalMessages from "../../../../../../messages/en/eval.json";
import commonMessages from "../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
const mutate = vi.fn();
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

// Eval hooks are driven from `evalState` so the Evals tab renders without a query client.
const evalState = vi.hoisted(() => ({
  cases: [] as unknown[],
  runs: [] as unknown[],
  detail: undefined as unknown,
  deleteMutate: vi.fn(),
  startMutate: vi.fn(),
}));
vi.mock("@/lib/hooks/eval", () => ({
  useAgentEvalCases: () => ({ data: evalState.cases, isError: false }),
  useAgentEvalRuns: () => ({ data: evalState.runs }),
  useEvalRun: () => ({ data: undefined }),
  useEvalCase: () => ({ data: evalState.detail, isError: false }),
  useDeleteEvalCase: () => ({ mutate: evalState.deleteMutate, isPending: false }),
  useStartEvalRun: () => ({ mutate: evalState.startMutate, isPending: false }),
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
    <NextIntlClientProvider locale="en" messages={{ agents: messages, eval: evalMessages, common: commonMessages }}>
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

  it("offers a Context tab after Skills", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const labels = screen.getAllByRole("button").map((el) => el.textContent?.trim());
    expect(labels.indexOf("Context")).toBe(labels.indexOf("Skills") + 1);
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

describe("Evals tab", () => {
  const evalCase = (id: string, last_result: string) => ({
    id,
    agent_id: "ag1",
    name: `must_find-${id}`,
    expectation: { type: "must_find", file: "src/a.ts", start_line: 3, end_line: 4 },
    meta: { source_finding_id: "f", source_review_id: "r", repo: "acme/api", pr_number: 482, head_sha: "h", pr_title: "t" },
    input_files: ["src/a.ts"],
    created_at: "2026-10-08T09:00:00Z",
    last_result,
  });
  const runRow = (over: Record<string, unknown>) => ({
    id: "r1", agent_id: "ag1", agent_version: 1, status: "completed", ran_at: "2026-10-08T09:00:00Z",
    finished_at: null, cases_done: 3, traces_passed: 1, traces_total: 3, cases_errored: 0, unlabeled: 0,
    recall: 0.5, precision: 0.5, citation_accuracy: 1, cost_usd: 0.01, cost_partial: false, duration_ms: 1000, ...over,
  });

  afterEach(() => {
    evalState.cases = [];
    evalState.runs = [];
    evalState.detail = undefined;
    evalState.deleteMutate.mockReset();
    evalState.startMutate.mockReset();
  });

  it("is the fourth tab (after Context) and lists cases with their last result and N / M passing", () => {
    evalState.cases = [evalCase("a", "passed"), evalCase("b", "failed"), evalCase("c", "never_run")];
    renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />);
    const labels = screen.getAllByRole("button").map((el) => el.textContent?.trim());
    expect(labels.indexOf("Evals")).toBe(labels.indexOf("Context") + 1);
    expect(screen.getByText("1 / 3 passing")).toBeInTheDocument();
    for (const text of ["passed", "failed", "never run"]) expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  });

  it("opens a case read-only with its diff, expectation and a link to the source PR", () => {
    evalState.cases = [evalCase("a", "passed")];
    evalState.detail = { ...evalCase("a", "passed"), input_diff: "diff --git a/src/a.ts b/src/a.ts\n+<b>x</b>" };
    renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "View must_find-a" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("diff --git a/src/a.ts b/src/a.ts");
    expect(dialog).toHaveTextContent("<b>x</b>"); // plain text, never HTML
    expect(dialog.querySelector("b")).toBeNull();
    expect(dialog).toHaveTextContent("must_find · src/a.ts:3-4");
    expect(screen.getByRole("link", { name: "Open acme/api #482 on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/pull/482",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("deletes a case only after the confirm, with one API call", () => {
    evalState.cases = [evalCase("a", "passed")];
    renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete must_find-a" }));
    expect(evalState.deleteMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete case" }));
    expect(evalState.deleteMutate).toHaveBeenCalledTimes(1);
    expect(evalState.deleteMutate.mock.calls[0]![0]).toBe("a");
  });

  it("disables Run eval and shows k / n cases while a run is running", () => {
    evalState.cases = [evalCase("a", "never_run")];
    evalState.runs = [runRow({ id: "r9", status: "running", cases_done: 2, traces_total: 5 })];
    renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />);
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();
    expect(screen.getAllByRole("status").some((el) => el.textContent === "2 / 5 cases")).toBe(true);
  });

  it("with no cases: Run eval is disabled and the empty state explains the next step", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />);
    expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled();
    expect(screen.getByText(/Turn into eval case/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(evalState.startMutate).not.toHaveBeenCalled();
  });

  it("starts a run on click when there are cases and nothing is running", () => {
    evalState.cases = [evalCase("a", "never_run")];
    renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    expect(evalState.startMutate).toHaveBeenCalledTimes(1);
  });
});
