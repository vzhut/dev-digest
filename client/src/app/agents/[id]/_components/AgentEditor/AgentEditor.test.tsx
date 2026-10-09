import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
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
  createAsync: vi.fn(),
  updateAsync: vi.fn(),
}));
vi.mock("@/lib/hooks/eval", () => ({
  useAgentEvalCases: () => ({ data: evalState.cases, isError: false }),
  useAgentEvalRuns: () => ({ data: evalState.runs }),
  useEvalRun: () => ({ data: undefined }),
  useEvalCase: () => ({ data: evalState.detail, isError: false }),
  useDeleteEvalCase: () => ({ mutate: evalState.deleteMutate, isPending: false }),
  useStartEvalRun: () => ({ mutate: evalState.startMutate, isPending: false }),
  useCreateManualEvalCase: () => ({ mutateAsync: evalState.createAsync, isPending: false }),
  useUpdateEvalCase: () => ({ mutateAsync: evalState.updateAsync, isPending: false }),
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
  const DIFF = ["--- a/src/a.ts", "+++ b/src/a.ts", "@@ -0,0 +1,6 @@", "+one", "+two", "+three", "+four", "+five", "+six"].join("\n");
  const evalCase = (id: string, last_result: string, over: Record<string, unknown> = {}) => ({
    id,
    agent_id: "ag1",
    name: `must_find-${id}`,
    expectation: { type: "must_find", file: "src/a.ts", start_line: 3, end_line: 4, label: { title: "Leak", category: "security", severity: "CRITICAL" } },
    meta: { source_finding_id: "f", source_review_id: "r", repo: "acme/api", pr_number: 482, head_sha: "h", pr_title: "Add payments", pr_body: "body" },
    input_files: ["src/a.ts"],
    created_at: "2026-10-08T09:00:00Z",
    last_result,
    last_run:
      last_result === "never_run"
        ? null
        : { status: last_result, findings_total: 2, findings_matched: last_result === "passed" ? 1 : 0, duration_ms: 1800, cost_usd: 0.02 },
    ...over,
  });
  const runRow = (over: Record<string, unknown>) => ({
    id: "r1", agent_id: "ag1", agent_version: 1, status: "completed", ran_at: "2026-10-08T09:00:00Z",
    finished_at: null, cases_done: 3, traces_passed: 1, traces_total: 3, cases_errored: 0, unlabeled: 0,
    recall: 0.5, precision: 0.5, citation_accuracy: 1, cost_usd: 0.01, cost_partial: false, duration_ms: 1000, ...over,
  });
  const open = () => renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />);

  afterEach(() => {
    evalState.cases = [];
    evalState.runs = [];
    evalState.detail = undefined;
    for (const m of [evalState.deleteMutate, evalState.startMutate, evalState.createAsync, evalState.updateAsync]) m.mockReset();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("is the fourth tab (after Context); rows show icon state, expected/got, severity chip and run / edit / delete (AC-49)", () => {
    evalState.cases = [evalCase("a", "passed"), evalCase("b", "failed"), evalCase("c", "never_run")];
    open();
    const labels = screen.getAllByRole("button").map((el) => el.textContent?.trim());
    expect(labels.indexOf("Evals")).toBe(labels.indexOf("Context") + 1);
    expect(screen.getByText("1 / 3 passing")).toBeInTheDocument();
    expect(screen.getByText(/^expected 1 finding, got 1 · 1\.8s/)).toBeInTheDocument(); // passed
    expect(screen.getByText(/^expected 1 finding, got 0/)).toBeInTheDocument(); // failed
    expect(screen.getByText(/^never run ·/)).toBeInTheDocument();
    expect(screen.getAllByText("CRITICAL · security").length).toBe(3);
    for (const verb of ["Run", "Edit", "Delete"]) expect(screen.getByRole("button", { name: `${verb} must_find-a` })).toBeInTheDocument();
  });

  it("header offers a primary New eval case and a secondary Run all evals (AC-50) that runs every case", () => {
    evalState.cases = [evalCase("a", "never_run")];
    open();
    expect(screen.getByRole("button", { name: "New eval case" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    expect(evalState.startMutate).toHaveBeenCalledTimes(1);
    expect(evalState.startMutate.mock.calls[0]![0]).toBeUndefined();
  });

  it("the row play button runs just that case (AC-46)", () => {
    evalState.cases = [evalCase("a", "never_run"), evalCase("b", "never_run")];
    open();
    fireEvent.click(screen.getByRole("button", { name: "Run must_find-b" }));
    expect(evalState.startMutate.mock.calls[0]![0]).toEqual(["b"]);
  });

  it("while a run is running every run control is disabled and progress shows k / n (AC-47)", () => {
    evalState.cases = [evalCase("a", "never_run")];
    evalState.runs = [runRow({ id: "r9", status: "running", cases_done: 2, traces_total: 5 })];
    open();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run must_find-a" })).toBeDisabled();
    expect(screen.getAllByRole("status").some((el) => el.textContent === "2 / 5 cases")).toBe(true);
  });

  it("with no cases: Run all evals is disabled and the empty state explains the next step", () => {
    open();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
    expect(screen.getByText(/Turn into eval case/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    expect(evalState.startMutate).not.toHaveBeenCalled();
  });

  it("deletes a case only after the confirm, with one API call", () => {
    evalState.cases = [evalCase("a", "passed")];
    open();
    fireEvent.click(screen.getByRole("button", { name: "Delete must_find-a" }));
    expect(evalState.deleteMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete case" }));
    expect(evalState.deleteMutate).toHaveBeenCalledTimes(1);
    expect(evalState.deleteMutate.mock.calls[0]![0]).toBe("a");
  });

  describe("case editor (AC-42, AC-45, AC-48)", () => {
    const fill = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

    it("New eval case opens an empty editor whose Save stays disabled until the form is valid", () => {
      open();
      fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("New eval case", { selector: "div" })).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/^Name/)).toHaveValue("");
      const save = within(dialog).getByRole("button", { name: "Save" });
      expect(save).toBeDisabled();
      expect(within(dialog).getByRole("button", { name: "Run case" })).toBeDisabled();
      fill(/^Name/, "stripe-key-leak");
      fill("Diff", DIFF);
      fill("File", "src/a.ts");
      fill("Start line", "2");
      fill("End line", "3");
      expect(save).toBeEnabled();
      expect(within(dialog).getByRole("status")).toHaveTextContent("valid");
      fill("End line", "1"); // end before start
      expect(save).toBeDisabled();
      expect(dialog).toHaveTextContent("end ≥ start");
      fill("End line", "3");
      fill("File", "src/other.ts");
      expect(save).toBeDisabled();
      expect(dialog).toHaveTextContent("That file is not in the diff.");
      fill("File", "src/a.ts");
      fill("Start line", "40");
      fill("End line", "41");
      expect(dialog).toHaveTextContent("outside every hunk");
    });

    it("saves a new case with the structured expectation and does NOT run it by default", async () => {
      evalState.createAsync.mockResolvedValue({ case: { id: "new1" }, created: true });
      open();
      fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
      fill(/^Name/, " stripe-key-leak ");
      fill("Diff", DIFF);
      fill("File", "src/a.ts");
      fill("Start line", "2");
      fill("End line", "3");
      fill("Title (optional)", "Leaked key");
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(evalState.createAsync).toHaveBeenCalledTimes(1));
      expect(evalState.createAsync.mock.calls[0]![0]).toMatchObject({
        name: "stripe-key-leak",
        input_diff: DIFF,
        expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 3, title: "Leaked key" },
      });
      expect(evalState.startMutate).not.toHaveBeenCalled(); // Run on save is OFF
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("Run on save defaults OFF, is remembered per browser, and when ON runs the saved case", async () => {
      evalState.createAsync.mockResolvedValue({ case: { id: "new1" }, created: true });
      open();
      fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
      const toggle = screen.getByRole("switch", { name: "Run on save" });
      expect(toggle).toHaveAttribute("aria-checked", "false");
      fireEvent.click(toggle);
      expect(window.localStorage.getItem("devdigest.eval.runOnSave")).toBe("1");
      fill(/^Name/, "n");
      fill("Diff", DIFF);
      fill("File", "src/a.ts");
      fill("Start line", "1");
      fill("End line", "1");
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(evalState.startMutate).toHaveBeenCalledTimes(1));
      expect(evalState.startMutate.mock.calls[0]![0]).toEqual(["new1"]);
      cleanup();
      open();
      fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
      await waitFor(() => expect(screen.getByRole("switch", { name: "Run on save" })).toHaveAttribute("aria-checked", "true"));
    });

    it("still works when localStorage throws (the toggle just stays OFF)", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      open();
      fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
      const toggle = screen.getByRole("switch", { name: "Run on save" });
      expect(toggle).toHaveAttribute("aria-checked", "false");
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-checked", "true");
    });

    it("edits an existing case: prefilled fields, tabs, last-run banner, read-only PR meta; Run case saves then runs it", async () => {
      evalState.cases = [evalCase("a", "passed")];
      evalState.detail = { ...evalCase("a", "passed"), input_diff: DIFF + "\n+<b>x</b>", notes: null };
      evalState.updateAsync.mockResolvedValue({ id: "a" });
      open();
      fireEvent.click(screen.getByRole("button", { name: "Edit must_find-a" }));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("Eval case · must_find-a");
      expect(dialog).toHaveTextContent("Security Reviewer · simulate a PR");
      expect(within(dialog).getByLabelText(/^Name/)).toHaveValue("must_find-a");
      expect(within(dialog).getByLabelText("File")).toHaveValue("src/a.ts");
      expect(within(dialog).getByLabelText("Start line")).toHaveValue("3");
      expect(within(dialog).getByLabelText("Diff")).toHaveValue(DIFF + "\n+<b>x</b>");
      expect(dialog.querySelector("b")).toBeNull();
      expect(within(dialog).getByRole("note")).toHaveTextContent("Last run passed · expected 1 finding, got 1 · 1.8s · $0.020");
      fireEvent.click(within(dialog).getByRole("tab", { name: "Files" }));
      expect(dialog).toHaveTextContent("src/a.ts");
      fireEvent.click(within(dialog).getByRole("tab", { name: "PR meta" }));
      expect(within(dialog).getByLabelText("PR title")).toHaveAttribute("readonly");
      expect(within(dialog).getByRole("link", { name: "Open acme/api #482 on GitHub" })).toHaveAttribute("href", "https://github.com/acme/api/pull/482");
      fireEvent.click(within(dialog).getByRole("button", { name: "Run case" }));
      await waitFor(() => expect(evalState.updateAsync).toHaveBeenCalledTimes(1));
      expect(evalState.updateAsync.mock.calls[0]![0]).toMatchObject({ caseId: "a", body: { name: "must_find-a" } });
      await waitFor(() => expect(evalState.startMutate.mock.calls[0]![0]).toEqual(["a"]));
    });

    it("disables Run case while a run is running, and shows the server's reason when saving fails", async () => {
      evalState.cases = [evalCase("a", "never_run")];
      evalState.detail = { ...evalCase("a", "never_run"), input_diff: DIFF, notes: null };
      evalState.runs = [runRow({ id: "r9", status: "running", cases_done: 0, traces_total: 1 })];
      const { ApiError } = await import("@/lib/api");
      evalState.updateAsync.mockRejectedValue(new ApiError("expectation is outside the diff", 422, "expectation_not_grounded"));
      open();
      fireEvent.click(screen.getByRole("button", { name: "Edit must_find-a" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("button", { name: "Run case" })).toBeDisabled();
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("expectation is outside the diff");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});
