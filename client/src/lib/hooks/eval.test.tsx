import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api";
import type { CreateEvalCaseResponse, EvalSuiteRun } from "@devdigest/shared";
import { evalKeys, evalRunsRefetchInterval, useCreateEvalCase, useEvalCaseLinks } from "./eval";

afterEach(() => vi.restoreAllMocks());

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { spy, wrapper };
}

const run = (status: EvalSuiteRun["status"]) => ({ status }) as EvalSuiteRun;

describe("eval hooks", () => {
  it("polls the runs list every 2 s only while a run is running", () => {
    expect(evalRunsRefetchInterval(undefined)).toBe(false);
    expect(evalRunsRefetchInterval([run("completed"), run("errored")])).toBe(false);
    expect(evalRunsRefetchInterval([run("completed"), run("running")])).toBe(2000);
  });

  it("creating a case refreshes the PR's links and the agent's case list", async () => {
    const created = { created: true, case: { agent_id: "a1" } } as CreateEvalCaseResponse;
    const post = vi.spyOn(api, "createEvalCase").mockResolvedValue(created);
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useCreateEvalCase("p1"), { wrapper });
    result.current.mutate("f1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledWith("f1");
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(evalKeys.links("p1"));
    expect(keys).toContainEqual(evalKeys.cases("a1"));
  });

  it("does not fetch links without a PR id", () => {
    const get = vi.spyOn(api, "getEvalCaseLinks");
    const { wrapper } = setup();
    renderHook(() => useEvalCaseLinks(null), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });
});
