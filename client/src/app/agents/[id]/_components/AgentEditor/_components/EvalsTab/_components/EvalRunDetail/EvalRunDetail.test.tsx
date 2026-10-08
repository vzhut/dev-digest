import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseResult, EvalSuiteRunDetail, Finding } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/eval.json";
import { EvalRunDetail } from "./EvalRunDetail";

afterEach(cleanup);

const finding = (title: string, start: number): Finding => ({
  id: title,
  severity: "WARNING",
  category: "bug",
  title,
  file: "src/a.ts",
  start_line: start,
  end_line: start,
  rationale: "r",
  confidence: 0.9,
});

const base = (over: Partial<EvalCaseResult>): EvalCaseResult => ({
  case_id: "c",
  status: "passed",
  produced: [],
  dropped: [],
  outcomes: [],
  noise: [],
  unlabeled: [],
  cost_usd: null,
  duration_ms: 1,
  ...over,
});

const RUN: EvalSuiteRunDetail = {
  id: "r1",
  agent_id: "a1",
  agent_version: 2,
  status: "completed",
  ran_at: "2026-10-08T09:00:00Z",
  finished_at: "2026-10-08T09:01:00Z",
  cases_done: 4,
  traces_passed: 2,
  traces_total: 4,
  cases_errored: 0,
  unlabeled: 1,
  recall: 0.5,
  precision: null,
  citation_accuracy: 0.8,
  cost_usd: 0.05,
  cost_partial: true,
  duration_ms: 42_000,
  provider: "openrouter",
  model: "m",
  system_prompt: "p",
  strategy: null,
  skills: [],
  case_ids: ["c1", "c2", "c3", "c4"],
  results: [
    base({
      case_id: "c1",
      case_name: "must_find-a",
      outcomes: [{ expectation: { type: "must_find", file: "src/a.ts", start_line: 1, end_line: 2 }, matched_by: [0] }],
      produced: [finding("Matched finding", 1)],
    }),
    base({
      case_id: "c2",
      case_name: "must_find-b",
      status: "failed",
      outcomes: [{ expectation: { type: "must_find", file: "src/a.ts", start_line: 40, end_line: 41 }, matched_by: [] }],
      produced: [finding("Unlabeled finding", 9)],
      unlabeled: [0],
      dropped: [{ finding: finding("Dropped finding", 99), reason: "outside hunk" }],
    }),
    base({
      case_id: "c3",
      case_name: "must_not_flag-c",
      status: "failed",
      outcomes: [{ expectation: { type: "must_not_flag", file: "src/a.ts", start_line: 5, end_line: 5 }, matched_by: [0] }],
      produced: [finding("Noisy finding", 5)],
      noise: [0],
    }),
  ],
};

function renderDetail(run: EvalSuiteRunDetail) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalRunDetail run={run} />
    </NextIntlClientProvider>,
  );
}

describe("EvalRunDetail", () => {
  it("shows metrics, p / n, a partial cost marker and a dash for a null metric", () => {
    renderDetail(RUN);
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("2 / 4")).toBeInTheDocument();
    expect(screen.getByText("≥ $0.050")).toBeInTheDocument();
    expect(screen.getByText("42.0s")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0); // null precision, never 0% / 100%
  });

  it("labels expectations and findings matched / missed / noise / unlabeled / dropped", () => {
    renderDetail(RUN);
    const label = (card: string, text: string) => {
      const section = screen.getByRole("region", { name: card });
      expect(section).toHaveTextContent(text);
    };
    label("must_find-a", "matched");
    label("must_find-b", "missed");
    label("must_find-b", "unlabeled");
    label("must_find-b", "dropped");
    label("must_not_flag-c", "noise");
    expect(screen.getByText(/Dropped finding/)).toBeInTheDocument();
  });

  it("shows one provider reason once when every case errored, as plain text", () => {
    const reason = "provider unavailable: <b>no key</b>";
    renderDetail({
      ...RUN,
      cases_errored: 2,
      recall: null,
      results: [
        base({ case_id: "c1", case_name: "one", status: "error", error: reason }),
        base({ case_id: "c2", case_name: "two", status: "error", error: reason }),
      ],
    });
    expect(screen.getAllByText(/provider unavailable/)).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("2 cases errored: provider unavailable: <b>no key</b>");
    expect(document.querySelector("b")).toBeNull();
  });
});
