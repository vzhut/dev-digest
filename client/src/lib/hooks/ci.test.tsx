import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  ciPreview: vi.fn(),
  ciInstall: vi.fn(),
  ciZip: vi.fn(),
  ciInstallations: vi.fn(),
  ciSyncRuns: vi.fn(),
}));
vi.mock("../api", () => ({ api }));

import { CI_RUNS_REFETCH_MS, useCiInstall, useCiInstallations, useCiPreview, useCiRuns, useCiZip } from "./ci";

const request = {
  repo_id: "11111111-1111-4111-8111-111111111111",
  triggers: ["opened" as const],
  post_as: "none" as const,
};

let qc: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  Object.values(api).forEach((f) => f.mockReset());
});
afterEach(cleanup);

describe("CI hooks", () => {
  it("useCiPreview sends the request for its agent", async () => {
    api.ciPreview.mockResolvedValue({ files: [], workflow_violations: [], warnings: [] });
    const { result } = renderHook(() => useCiPreview("a1"), { wrapper });
    await act(() => result.current.mutateAsync(request));
    expect(api.ciPreview).toHaveBeenCalledWith("a1", request);
  });

  it("install and zip refresh the agent's installations list on success, and only that agent's", async () => {
    api.ciInstall.mockResolvedValue({ installation: {}, pr_url: null });
    api.ciZip.mockResolvedValue(new Blob(["z"]));
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    const install = renderHook(() => useCiInstall("a1"), { wrapper });
    await act(() => install.result.current.mutateAsync(request));
    const zip = renderHook(() => useCiZip("a1"), { wrapper });
    await act(() => zip.result.current.mutateAsync(request));

    expect(invalidate).toHaveBeenCalledTimes(2);
    for (const call of invalidate.mock.calls) expect(call[0]).toEqual({ queryKey: ["ci", "installations", "a1"] });
  });

  it("useCiZip hands the blob to its own callback, even without a per-call callback", async () => {
    const blob = new Blob(["zip"]);
    api.ciZip.mockResolvedValue(blob);
    const onBlob = vi.fn();
    const { result } = renderHook(() => useCiZip("a1", onBlob), { wrapper });
    await act(() => result.current.mutateAsync(request));
    expect(onBlob).toHaveBeenCalledTimes(1);
    expect(onBlob).toHaveBeenCalledWith(blob);
  });

  it("a failed install does not invalidate anything", async () => {
    api.ciInstall.mockRejectedValue(new Error("nope"));
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCiInstall("a1"), { wrapper });
    await act(() => result.current.mutateAsync(request).catch(() => undefined));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("useCiInstallations loads the list of its agent", async () => {
    api.ciInstallations.mockResolvedValue([{ id: "i1" }]);
    const { result } = renderHook(() => useCiInstallations("a9"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.ciInstallations).toHaveBeenCalledWith("a9");
    expect(result.current.data).toEqual([{ id: "i1" }]);
  });

  it("useCiRuns syncs on every fetch and polls once a minute", async () => {
    api.ciSyncRuns.mockResolvedValue({ runs: [], accepted: 0, duplicates: 0, rejected: 0 });
    const { result } = renderHook(() => useCiRuns(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.ciSyncRuns).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });
    expect(api.ciSyncRuns).toHaveBeenCalledTimes(2);

    expect(CI_RUNS_REFETCH_MS).toBe(60_000);
    const observer = qc.getQueryCache().find({ queryKey: ["ci", "runs"] })!.observers[0]!;
    expect(observer.options.refetchInterval).toBe(60_000);
    expect(observer.options.refetchIntervalInBackground).toBe(false);
  });
});
