import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentEvalCase, AgentEvalCaseDetail, EvalSuiteRun, EvalSuiteRunDetail } from "@devdigest/shared";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import commonMessages from "../../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";
import { ApiError, api } from "@/lib/api";
import { EvalsTab } from "./EvalsTab";

/* Real query client + hooks; only the network edge (`api.*`) is replaced. */

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;
const DIFF = ["--- a/src/a.ts", "+++ b/src/a.ts", "@@ -0,0 +1,6 @@", "+one", "+two", "+three", "+four", "+five", "+six"].join("\n");

const data = { cases: [] as AgentEvalCase[], runs: [] as EvalSuiteRun[], detail: undefined as AgentEvalCaseDetail | undefined };

const evalCase = (id: string, last: "passed" | "failed" | "never_run", over: Partial<AgentEvalCase> = {}): AgentEvalCase => ({
  id,
  agent_id: "ag1",
  name: `must_find-${id}`,
  expectation: { type: "must_find", file: "src/a.ts", start_line: 3, end_line: 4, label: { title: "Leak", category: "security", severity: "CRITICAL" } },
  meta: { source_finding_id: "f", source_review_id: "r", repo: "acme/api", pr_number: 482, head_sha: "h", pr_title: "Add payments", pr_body: "body" },
  input_files: ["src/a.ts"],
  created_at: "2026-10-08T09:00:00Z",
  last_result: last,
  last_run: last === "never_run" ? null : { status: last, findings_total: 2, findings_matched: last === "passed" ? 1 : 0, duration_ms: 1800, cost_usd: 0.02 },
  ...over,
});

const runRow = (over: Partial<EvalSuiteRun>): EvalSuiteRun => ({
  id: "r1", agent_id: "ag1", agent_version: 1, status: "completed", ran_at: "2026-10-08T09:00:00Z", finished_at: null,
  cases_done: 3, traces_passed: 1, traces_total: 3, cases_errored: 0, unlabeled: 0, recall: 0.5, precision: 0.5,
  citation_accuracy: 1, cost_usd: 0.01, cost_partial: false, duration_ms: 1000, ...over,
} as EvalSuiteRun);

let spies: ReturnType<typeof installSpies>;

function installSpies() {
  return {
    cases: vi.spyOn(api, "listAgentEvalCases").mockImplementation(async () => data.cases),
    runs: vi.spyOn(api, "listAgentEvalRuns").mockImplementation(async () => data.runs),
    run: vi.spyOn(api, "getEvalRun").mockImplementation(
      async (id) => ({ ...(data.runs.find((r) => r.id === id) as EvalSuiteRun), provider: "p", model: "m", system_prompt: "", strategy: null, skills: [], case_ids: [], results: [] }) as EvalSuiteRunDetail,
    ),
    one: vi.spyOn(api, "getEvalCase").mockImplementation(async () => data.detail as AgentEvalCaseDetail),
    del: vi.spyOn(api, "deleteEvalCase").mockResolvedValue(undefined),
    start: vi.spyOn(api, "startEvalRun").mockResolvedValue({ eval_run_id: "new", status: "running" }),
    create: vi.spyOn(api, "createManualEvalCase").mockResolvedValue({ created: true, case: { id: "new1" } } as never),
    update: vi.spyOn(api, "updateEvalCase").mockResolvedValue({ id: "a" } as never),
  };
}

beforeEach(() => {
  spies = installSpies();
});
afterEach(() => {
  cleanup();
  data.cases = [];
  data.runs = [];
  data.detail = undefined;
  window.localStorage.clear();
  vi.restoreAllMocks();
});

async function open() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common: commonMessages }}>
        <ToastProvider>
          <EvalsTab agent={AGENT} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: "New eval case" });
}
const fill = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("Evals tab", () => {
  it("rows show icon state, expected/got, severity chip and run / edit / delete (AC-49), with the N / M chip", async () => {
    data.cases = [evalCase("a", "passed"), evalCase("b", "failed"), evalCase("c", "never_run")];
    await open();
    expect(screen.getByText("1 / 3 passing")).toBeInTheDocument();
    expect(screen.getByText(/^expected 1 finding, got 1 · 1\.8s/)).toBeInTheDocument();
    expect(screen.getByText(/^expected 1 finding, got 0/)).toBeInTheDocument();
    expect(screen.getByText(/^never run ·/)).toBeInTheDocument();
    expect(screen.getAllByText("CRITICAL · security")).toHaveLength(3);
    for (const verb of ["Run", "Edit", "Delete"]) expect(screen.getByRole("button", { name: `${verb} must_find-a` })).toBeInTheDocument();
  });

  it("a case without a finding label shows its type as the chip (localised, not the raw enum)", async () => {
    data.cases = [
      evalCase("a", "never_run", { expectation: { type: "must_find", file: "src/a.ts", start_line: 1, end_line: 2 } }),
      evalCase("b", "never_run", { expectation: { type: "must_not_flag", file: "src/a.ts", start_line: 1, end_line: 2 } }),
    ];
    await open();
    expect(screen.getByText("must find")).toBeInTheDocument();
    expect(screen.getByText("empty []")).toBeInTheDocument();
  });

  it("header: primary New eval case + secondary Run all evals (AC-50) that runs every case; the row play runs just one (AC-46)", async () => {
    data.cases = [evalCase("a", "never_run"), evalCase("b", "never_run")];
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    await waitFor(() => expect(spies.start).toHaveBeenCalledTimes(1));
    expect(spies.start).toHaveBeenLastCalledWith("ag1", undefined);
    fireEvent.click(screen.getByRole("button", { name: "Run must_find-b" }));
    await waitFor(() => expect(spies.start).toHaveBeenCalledTimes(2));
    expect(spies.start).toHaveBeenLastCalledWith("ag1", ["b"]);
  });

  it("while a run is running every run control is disabled and progress shows k / n (AC-47)", async () => {
    data.cases = [evalCase("a", "never_run")];
    data.runs = [runRow({ id: "r9", status: "running", cases_done: 2, traces_total: 5 })];
    await open();
    await waitFor(() => expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Run must_find-a" })).toBeDisabled();
    expect(screen.getAllByRole("status").some((el) => el.textContent === "2 / 5 cases")).toBe(true);
    data.detail = { ...evalCase("a", "never_run"), input_diff: DIFF, notes: null };
    fireEvent.click(screen.getByRole("button", { name: "Edit must_find-a" }));
    expect(await screen.findByRole("button", { name: "Run case" })).toBeDisabled();
  });

  it("with no cases: Run all evals is disabled and the empty state explains the next step", async () => {
    await open();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
    expect(screen.getByText(/Turn into eval case/)).toBeInTheDocument();
    expect(spies.start).not.toHaveBeenCalled();
  });

  it("deletes a case only after the confirm, with one API call; a failed delete says so", async () => {
    data.cases = [evalCase("a", "passed")];
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Delete must_find-a" }));
    expect(spies.del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete case" }));
    await waitFor(() => expect(spies.del).toHaveBeenCalledTimes(1));
    expect(spies.del.mock.calls[0]![0]).toBe("a");
  });

  describe("case editor (AC-42, AC-45, AC-48)", () => {
    it("New eval case opens an empty editor whose Save stays disabled until the form is valid, with the server's rules mirrored", async () => {
      await open();
      fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
      const dialog = screen.getByRole("dialog");
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
      fill("End line", "1");
      expect(save).toBeDisabled();
      expect(dialog).toHaveTextContent("end ≥ start");
      fill("End line", "3");
      fill("File", "src/other.ts");
      expect(dialog).toHaveTextContent("That file is not in the diff.");
      fill("File", "src/a.ts");
      fill("Start line", "40");
      fill("End line", "41");
      expect(dialog).toHaveTextContent("outside every hunk");
    });

    it("saves a new case with the structured expectation and does NOT run it by default", async () => {
      await open();
      fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
      fill(/^Name/, " stripe-key-leak ");
      fill("Diff", DIFF);
      fill("File", "src/a.ts");
      fill("Start line", "2");
      fill("End line", "3");
      fill("Title (optional)", "Leaked key");
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(spies.create).toHaveBeenCalledTimes(1));
      expect(spies.create.mock.calls[0]).toMatchObject([
        "ag1",
        { name: "stripe-key-leak", input_diff: DIFF, expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 3, title: "Leaked key" } },
      ]);
      expect(spies.start).not.toHaveBeenCalled(); // Run on save is OFF
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("Run on save defaults OFF, is remembered per browser, and when ON runs the saved case", async () => {
      await open();
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
      await waitFor(() => expect(spies.start).toHaveBeenCalledTimes(1));
      expect(spies.start).toHaveBeenLastCalledWith("ag1", ["new1"]);
      cleanup();
      await open();
      fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
      await waitFor(() => expect(screen.getByRole("switch", { name: "Run on save" })).toHaveAttribute("aria-checked", "true"));
    });

    it("still works when localStorage throws (the toggle just stays OFF)", async () => {
      await open();
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
      const toggle = screen.getByRole("switch", { name: "Run on save" });
      expect(toggle).toHaveAttribute("aria-checked", "false");
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-checked", "true");
    });

    it("edits an existing case: prefilled fields, tabs, last-run banner, read-only PR meta; Run case saves then runs it", async () => {
      data.cases = [evalCase("a", "passed")];
      data.detail = { ...evalCase("a", "passed"), input_diff: DIFF + "\n+<b>x</b>", notes: null };
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Edit must_find-a" }));
      await screen.findByLabelText("File"); // the loading dialog is replaced by the form dialog
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
      await waitFor(() => expect(spies.update).toHaveBeenCalledTimes(1));
      expect(spies.update.mock.calls[0]).toMatchObject(["a", { name: "must_find-a" }]);
      await waitFor(() => expect(spies.start).toHaveBeenLastCalledWith("ag1", ["a"]));
    });

    it("shows the server's reason when saving fails and keeps the editor open", async () => {
      data.cases = [evalCase("a", "never_run")];
      data.detail = { ...evalCase("a", "never_run"), input_diff: DIFF, notes: null };
      spies.update.mockRejectedValue(new ApiError("expectation is outside the diff", 422, "expectation_not_grounded"));
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Edit must_find-a" }));
      await screen.findByLabelText("File"); // the loading dialog is replaced by the form dialog
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("expectation is outside the diff");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});
