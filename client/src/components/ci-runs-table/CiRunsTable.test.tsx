import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiRunItem } from "@devdigest/shared";
import ci from "../../../messages/en/ci.json";
import { CiRunsTable } from "./CiRunsTable";

afterEach(cleanup);

const run = (id: string, over: Partial<CiRunItem> = {}): CiRunItem => ({
  id,
  agent_id: "a1",
  agent_name: "Security Reviewer",
  repo: "acme/payments-api",
  pr_number: 12,
  pr_url: "https://github.com/acme/payments-api/pull/12",
  commit_sha: null,
  status: "done",
  verdict: "pass",
  blockers: 0,
  findings_count: 3,
  critical: 2,
  warning: 1,
  suggestion: 0,
  cost_usd: 0.0142,
  duration_ms: 12300,
  ran_at: "2026-10-01T10:00:00Z",
  job_url: "https://github.com/acme/payments-api/actions/runs/99",
  ...over,
});

function renderTable(runs: CiRunItem[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci }}>
      <CiRunsTable runs={runs} />
    </NextIntlClientProvider>,
  );
}

/** The body row that contains the given repo text, one per run in these tests. */
const bodyRows = () => screen.getAllByRole("row").slice(1);

describe("CiRunsTable", () => {
  it("renders every column of a finished run with links that open GitHub", () => {
    renderTable([run("r1")]);
    const [row] = bodyRows();
    const cells = within(row!);

    expect(cells.getByText("acme/payments-api")).toBeInTheDocument();
    const pr = cells.getByRole("link", { name: "#12" });
    expect(pr).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/12");
    expect(pr).toHaveAttribute("rel", "noopener noreferrer");
    expect(cells.getByText("Security Reviewer")).toBeInTheDocument();
    expect(cells.getByText("Passed")).toBeInTheDocument();
    expect(cells.getByText("3")).toBeInTheDocument();
    expect(cells.getByText("2 critical · 1 warning · 0 suggestion")).toBeInTheDocument();
    expect(cells.getByText("$0.014")).toBeInTheDocument();
    expect(cells.getByText("12.3s")).toBeInTheDocument();
    const job = cells.getByRole("link", { name: "Open the CI job for acme/payments-api on GitHub" });
    expect(job).toHaveAttribute("href", "https://github.com/acme/payments-api/actions/runs/99");
    expect(job).toHaveTextContent("View");
  });

  it("shows an em dash for an unknown cost, never $0", () => {
    renderTable([run("r1", { cost_usd: null })]);
    const row = within(bodyRows()[0]!);
    expect(row.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("labels the result by verdict or status", () => {
    renderTable([
      run("a", { verdict: "fail" }),
      run("b", { status: "failed", verdict: null }),
      run("c", { status: "skipped", verdict: null }),
    ]);
    const rows = bodyRows();
    expect(within(rows[0]!).getByText("Blocked")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Failed")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Skipped")).toBeInTheDocument();
  });

  it("hides the breakdown when there are no findings or the split is unknown", () => {
    renderTable([
      run("none", { findings_count: 0, critical: 0, warning: 0, suggestion: 0 }),
      run("unsplit", { findings_count: 4, critical: null, warning: null, suggestion: null }),
      run("unknown", { findings_count: null, critical: null, warning: null, suggestion: null }),
    ]);
    const rows = bodyRows();
    expect(within(rows[0]!).queryByText(/critical/)).not.toBeInTheDocument();
    expect(within(rows[1]!).getByText("4")).toBeInTheDocument();
    expect(within(rows[1]!).queryByText(/critical/)).not.toBeInTheDocument();
    expect(within(rows[2]!).queryByText(/critical/)).not.toBeInTheDocument();
  });

  it("renders no link for an unsafe job_url or pr_url, and plain text for the PR number", () => {
    renderTable([
      run("bad", {
        pr_url: "javascript:alert(1)",
        job_url: "http://github.com/acme/payments-api/actions/runs/1",
      }),
      run("garbage", { pr_url: null, job_url: "not a url" }),
    ]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(within(bodyRows()[0]!).getByText("#12")).toBeInTheDocument();
  });

  it("shows a dash instead of a PR number when the run has no pull request", () => {
    renderTable([run("r1", { pr_number: null, pr_url: null })]);
    const prCell = within(bodyRows()[0]!).getAllByRole("cell")[2]!;
    expect(prCell).toHaveTextContent(/^—$/);
  });
});
