import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useNow } from "./useNow";

describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("ticks every second while active", () => {
    const { result } = renderHook(() => useNow(true));
    const start = result.current;
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current - start).toBe(3000);
  });

  it("does not tick while inactive", () => {
    const { result } = renderHook(() => useNow(false));
    const start = result.current;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(start);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the interval on unmount and when it turns inactive", () => {
    const { rerender, unmount } = renderHook(({ on }) => useNow(on), { initialProps: { on: true } });
    expect(vi.getTimerCount()).toBe(1);
    rerender({ on: false });
    expect(vi.getTimerCount()).toBe(0);
    rerender({ on: true });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
