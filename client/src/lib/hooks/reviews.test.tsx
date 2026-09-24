import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { reviewKeys, useInvalidatePrRuns } from "./reviews";

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
  });

  it("does nothing before the PR id is known", () => {
    const { result, spy } = setup(null);
    result.current.activeRuns();
    result.current.history();
    expect(spy).not.toHaveBeenCalled();
  });
});

// --- useRunEvents: SSE lifecycle -------------------------------------------
import { act } from "@testing-library/react";
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
