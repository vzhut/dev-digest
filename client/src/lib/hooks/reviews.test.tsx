import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { reviewKeys, useInvalidatePrRuns, useRerunIntent } from "./reviews";
import { api } from "../api";

function setup(prId: string | null) {
  const qc = new QueryClient();
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useInvalidatePrRuns(prId), { wrapper });
  return { result, spy };
}

describe("useInvalidatePrRuns", () => {
  it("invalidates exactly the keys usePrActiveRuns / usePrRuns query", () => {
    const { result, spy } = setup("pr1");
    result.current.activeRuns();
    result.current.history();
    expect(spy).toHaveBeenNthCalledWith(1, { queryKey: reviewKeys.activeRuns("pr1") });
    expect(spy).toHaveBeenNthCalledWith(2, { queryKey: reviewKeys.runs("pr1") });
    // a settled review may have derived the intent, so history() refreshes it too
    expect(spy).toHaveBeenNthCalledWith(3, { queryKey: reviewKeys.intent("pr1") });
  });

  it("does nothing before the PR id is known", () => {
    const { result, spy } = setup(null);
    result.current.activeRuns();
    result.current.history();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useRerunIntent", () => {
  it("POSTs the re-run and writes the fresh record into the intent cache", async () => {
    const record = { pr_id: "pr1", intent: "Add rate limiting" };
    const post = vi.spyOn(api, "post").mockResolvedValue(record);
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRerunIntent("pr1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(post).toHaveBeenCalledWith("/pulls/pr1/intent");
    expect(qc.getQueryData(reviewKeys.intent("pr1"))).toEqual({ intent: record });
    post.mockRestore();
  });
});

// --- useSmartDiff ------------------------------------------------------------
import { useSmartDiff } from "./reviews";
import { waitFor } from "@testing-library/react";
import type { SmartDiff } from "@devdigest/shared";

describe("useSmartDiff", () => {
  const smartDiff: SmartDiff = {
    groups: [
      {
        role: "core",
        files: [{ path: "src/a.ts", pseudocode_summary: null, additions: 3, deletions: 1, finding_lines: [7] }],
      },
    ],
    split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
  };

  function render(prId: string | null | undefined) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSmartDiff(prId), { wrapper });
    return { result, qc };
  }

  it("GETs /pulls/:id/smart-diff and caches the payload under reviewKeys.smartDiff(prId)", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(smartDiff);
    const { result, qc } = render("pr1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/pulls/pr1/smart-diff");
    expect(result.current.data).toEqual(smartDiff);
    expect(qc.getQueryData(["pr-smart-diff", "pr1"])).toEqual(smartDiff);
    expect(reviewKeys.smartDiff("pr1")).toEqual(["pr-smart-diff", "pr1"]);
    expect(reviewKeys.smartDiff("pr2")).not.toEqual(reviewKeys.smartDiff("pr1"));
    get.mockRestore();
  });

  it("does not fetch until the PR id is known", () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(smartDiff);
    const { result } = render(undefined);
    expect(get).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    get.mockRestore();
  });
});

// --- useRunEvents: SSE lifecycle -------------------------------------------
import { useRunEvents } from "./reviews";

class FakeEventSource {
  static all: FakeEventSource[] = [];
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.all.push(this);
  }
  addEventListener() {}
  close() {
    this.closed = true;
  }
}

describe("useRunEvents", () => {
  it("calls onSettled exactly once, when every stream has ended", () => {
    FakeEventSource.all = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const onSettled = vi.fn();
    const { result, rerender } = renderHook(({ cb }) => useRunEvents(["r1", "r2"], { onSettled: cb }), {
      initialProps: { cb: onSettled },
    });
    expect(result.current.running).toBe(true);
    expect(FakeEventSource.all).toHaveLength(2);

    act(() => FakeEventSource.all[0]!.onerror!());
    expect(onSettled).not.toHaveBeenCalled(); // one stream still open

    act(() => FakeEventSource.all[1]!.onerror!());
    expect(result.current.running).toBe(false);
    expect(onSettled).toHaveBeenCalledTimes(1);

    // A parent re-render with a new callback identity must not fire it again.
    const next = vi.fn();
    rerender({ cb: next });
    rerender({ cb: next });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
