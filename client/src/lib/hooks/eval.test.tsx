import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api";
import type { CreateEvalCaseResponse, EvalSuiteRun } from "@devdigest/shared";
import { evalKeys, evalRunsRefetchInterval, useAgentEvalRuns, useCreateEvalCase, useDeleteEvalCase, useEvalCaseLinks } from "./eval";

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

  it("when the last running run finishes, the case rows and dashboards are refreshed (polling alone never would)", async () => {
    const list = vi
      .spyOn(api, "listAgentEvalRuns")
      .mockResolvedValueOnce([run("running")])
      .mockResolvedValue([run("completed")]);
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useAgentEvalRuns("a1"), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.status).toBe("running"));
    expect(spy).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.data?.[0]?.status).toBe("completed"));
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(evalKeys.cases("a1"));
    expect(keys).toContainEqual(evalKeys.agentDashboard("a1"));
    expect(keys).toContainEqual(evalKeys.dashboard);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("deleting a case refreshes every PR's case links, so the FindingCard action comes back", async () => {
    vi.spyOn(api, "deleteEvalCase").mockResolvedValue(undefined);
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useDeleteEvalCase("a1"), { wrapper });
    result.current.mutate("c1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(evalKeys.linksAll);
    expect(keys).toContainEqual(evalKeys.agentDashboard("a1"));
  });
});
