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
