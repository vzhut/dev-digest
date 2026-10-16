import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiAgentRunDetail } from "@devdigest/shared";
import multiAgent from "../../../../../../../../../messages/en/multiAgent.json";
import { RunHeader } from "./RunHeader";

afterEach(cleanup);

const run = (over: Partial<MultiAgentRunDetail> = {}) =>
  ({
    id: "m1",
    pr_id: "pr1",
    pr_number: 482,
    pr_title: "Add rate limiting",
    ran_at: "2026-10-13T10:00:00.000Z",
    status: "partial",
    agent_count: 2,
    total_duration_ms: 8200,
    total_cost_usd: 0.2,
    columns: [{ cost_usd: 0.1 }, { cost_usd: 0.1 }],
    conflicts: [],
    ...over,
  }) as unknown as MultiAgentRunDetail;

const renderHeader = (r: MultiAgentRunDetail) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent }}>
      <RunHeader run={r} />
    </NextIntlClientProvider>,
  );

describe("RunHeader", () => {
  it("shows #<n>, the PR title, the status and the 'N agents · parallel · wall total · cost' meta", () => {
    renderHeader(run());
    expect(screen.getByText("#482")).toBeInTheDocument();
    expect(screen.getByText("Add rate limiting")).toBeInTheDocument();
    expect(screen.getByText("partial")).toBeInTheDocument();
    expect(screen.getByText("2 agents · parallel · 8.2s total · $0.20")).toBeInTheDocument();
  });

  it("copes with a missing PR number/title and an unfinished run", () => {
    renderHeader(
      run({
        pr_number: null,
        pr_title: null,
        status: "running",
        agent_count: 1,
        total_duration_ms: null,
        columns: [{ cost_usd: null }] as MultiAgentRunDetail["columns"],
      }),
    );
    expect(screen.getByText("Pull request")).toBeInTheDocument();
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("1 agent · parallel · — total · —")).toBeInTheDocument();
  });
});
