import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { PrBrief, PrBriefResponse } from "@devdigest/shared";
import { briefKeys, usePrBrief, useGeneratePrBrief } from "./brief";

afterEach(() => vi.restoreAllMocks());

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, spy, wrapper };
}

const BRIEF = { summary: "S", risks: { risks: [] }, review_focus: [] } as unknown as PrBrief;

describe("usePrBrief", () => {
  it("GETs on mount without ever POSTing, and does not fetch without a PR id", async () => {
    const get = vi
      .spyOn(api, "getPrBrief")
      .mockResolvedValue({ status: "none", stale: false, brief: null });
    const post = vi.spyOn(api, "generatePrBrief");
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrBrief("p1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("p1");
    expect(post).not.toHaveBeenCalled();

    get.mockClear();
    renderHook(() => usePrBrief(null), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });

  it("polls while generating and stops once ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const get = vi
        .spyOn(api, "getPrBrief")
        .mockResolvedValueOnce({ status: "generating", stale: false, brief: null })
        .mockResolvedValue({ status: "ready", stale: false, brief: BRIEF });
      const { wrapper } = setup();
      const { result } = renderHook(() => usePrBrief("p1"), { wrapper });
      await waitFor(() => expect(result.current.data?.status).toBe("generating"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      await waitFor(() => expect(result.current.data?.status).toBe("ready"));
      const calls = get.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(get.mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useGeneratePrBrief", () => {
  it("writes the stored brief into the cache and refetches (bare brief or full response)", async () => {
    const post = vi.spyOn(api, "generatePrBrief").mockResolvedValue(BRIEF);
    const { qc, spy, wrapper } = setup();
    const { result } = renderHook(() => useGeneratePrBrief("p1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(qc.getQueryData<PrBriefResponse>(briefKeys.brief("p1"))).toEqual({
      status: "ready",
      stale: false,
      brief: BRIEF,
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: briefKeys.brief("p1") });

    post.mockResolvedValue({ status: "ready", stale: false, brief: { ...BRIEF, summary: "T" } });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(qc.getQueryData<PrBriefResponse>(briefKeys.brief("p1"))?.brief?.summary).toBe("T");
  });

  it("refetches on 409 generation_in_progress but not on other errors", async () => {
    const post = vi
      .spyOn(api, "generatePrBrief")
      .mockRejectedValueOnce(new ApiError("busy", 409, "generation_in_progress"))
      .mockRejectedValueOnce(new ApiError("boom", 502, "brief_generation_failed"));
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useGeneratePrBrief("p1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync().catch(() => {});
    });
    expect(spy).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.mutateAsync().catch(() => {});
    });
    expect(post).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
