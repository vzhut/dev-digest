import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { OnboardingTourResponse, Tour } from "@devdigest/shared";
import { onboardingKeys, useOnboardingTour, useGenerateOnboardingTour } from "./onboarding";

afterEach(() => vi.restoreAllMocks());

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, spy, wrapper };
}

const TOUR = { repo_id: "r1", source_sha: "abc" } as unknown as Tour;

describe("useOnboardingTour", () => {
  it("GETs on mount without ever POSTing", async () => {
    const get = vi
      .spyOn(api, "getOnboardingTour")
      .mockResolvedValue({ status: "none", tour: null, index_sha: "abc" });
    const post = vi.spyOn(api, "generateOnboardingTour");
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("r1");
    expect(post).not.toHaveBeenCalled();
    expect(qc.getQueryData(["onboarding-tour", "r1"])).toBeDefined();
  });

  it("polls while generating and stops once ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const get = vi
        .spyOn(api, "getOnboardingTour")
        .mockResolvedValueOnce({ status: "generating", tour: null, index_sha: "abc" })
        .mockResolvedValue({ status: "ready", tour: TOUR, index_sha: "abc" });
      const { wrapper } = setup();
      const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper });
      await waitFor(() => expect(result.current.data?.status).toBe("generating"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      await waitFor(() => expect(result.current.data?.status).toBe("ready"));
      const calls = get.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(get).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useGenerateOnboardingTour", () => {
  it("POSTs, caches the tour as ready keeping index_sha, and invalidates", async () => {
    const post = vi.spyOn(api, "generateOnboardingTour").mockResolvedValue(TOUR);
    const { qc, spy, wrapper } = setup();
    qc.setQueryData<OnboardingTourResponse>(onboardingKeys.tour("r1"), {
      status: "none",
      tour: null,
      index_sha: "abc",
    });
    const { result } = renderHook(() => useGenerateOnboardingTour("r1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(post).toHaveBeenCalledWith("r1");
    expect(qc.getQueryData(onboardingKeys.tour("r1"))).toEqual({
      status: "ready",
      tour: TOUR,
      index_sha: "abc",
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: onboardingKeys.tour("r1") });
  });

  it("refetches and surfaces the error on 409 generation_in_progress", async () => {
    vi.spyOn(api, "generateOnboardingTour").mockRejectedValue(
      new ApiError("busy", 409, "generation_in_progress"),
    );
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useGenerateOnboardingTour("r1"), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toMatchObject({ status: 409 });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: onboardingKeys.tour("r1") });
  });

  it("does not refetch on other errors", async () => {
    vi.spyOn(api, "generateOnboardingTour").mockRejectedValue(new ApiError("nope", 409, "not_cloned"));
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useGenerateOnboardingTour("r1"), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toBeInstanceOf(ApiError);
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
