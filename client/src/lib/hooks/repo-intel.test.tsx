import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useResyncRepoIntel } from "./repo-intel";
import { api } from "../api";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useResyncRepoIntel", () => {
  it("POSTs the resync and moves pending → queued on a clean enqueue", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ status: "full", lastIndexedSha: "sha0", updatedAt: "t0" });
    const post = vi.spyOn(api, "post").mockResolvedValue({ status: "accepted", jobId: "job1" });
    const { wrapper } = setup();
    const { result } = renderHook(() => useResyncRepoIntel("repo1"), { wrapper });

    act(() => result.current.resync());
    expect(result.current.phase).toBe("pending");

    await waitFor(() => expect(result.current.phase).toBe("queued"));
    expect(post).toHaveBeenCalledWith("/repos/repo1/resync");
  });

  it("goes to the failed phase without polling when the enqueue itself is degraded", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ status: "full", lastIndexedSha: "sha0", updatedAt: "t0" });
    const post = vi.spyOn(api, "post").mockResolvedValue({ status: "accepted", degraded: true, reason: "no_handler" });

    const { wrapper } = setup();
    const { result } = renderHook(() => useResyncRepoIntel("repo1"), { wrapper });

    act(() => result.current.resync());
    await waitFor(() => expect(result.current.phase).toBe("failed"));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("goes to the failed phase when the resync request itself errors", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ status: "full", lastIndexedSha: "sha0", updatedAt: "t0" });
    vi.spyOn(api, "post").mockRejectedValue(new Error("network down"));

    const { wrapper } = setup();
    const { result } = renderHook(() => useResyncRepoIntel("repo1"), { wrapper });

    act(() => result.current.resync());
    await waitFor(() => expect(result.current.phase).toBe("failed"));
  });

  it("goes idle and calls onIndexed once a later poll differs from the first one after queueing", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({ status: "full", lastIndexedSha: "sha0", updatedAt: "t0" }) // initial mount fetch
      .mockResolvedValueOnce({ status: "full", lastIndexedSha: "sha0", updatedAt: "t0" }) // first poll tick → becomes the baseline
      .mockResolvedValue({ status: "full", lastIndexedSha: "sha1", updatedAt: "t1" }); // later tick → advanced
    vi.spyOn(api, "post").mockResolvedValue({ status: "accepted", jobId: "job1" });
    const onIndexed = vi.fn();

    const { wrapper } = setup();
    const { result, rerender } = renderHook(() => useResyncRepoIntel("repo1", onIndexed), { wrapper });

    act(() => result.current.resync());
    await waitFor(() => expect(result.current.phase).toBe("queued"));
    // first poll tick establishes the baseline (no onIndexed yet)
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2), { timeout: 3000 });
    rerender();
    expect(onIndexed).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("queued");
  });
});
