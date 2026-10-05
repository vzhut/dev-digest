import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api";
import {
  contextKeys,
  useContextDocs,
  useContextDoc,
  useSaveContextRoots,
  useWriteContextFile,
  useSaveAgentContext,
  useSaveSkillContext,
} from "./context";

afterEach(() => vi.restoreAllMocks());

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, spy, wrapper };
}

describe("context queries", () => {
  it("fetches the listing under ['context', repoId] and refetch rescans", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ files: [] });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useContextDocs("r1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/repos/r1/context");
    expect(qc.getQueryData(["context", "r1"])).toEqual({ files: [] });
    await act(async () => {
      await result.current.refetch();
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("loads a doc only once a path is chosen, encoding it", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ path: "a b.md", content: "x" });
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ p }: { p: string | null }) => useContextDoc("r1", p), {
      wrapper,
      initialProps: { p: null as string | null },
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
    rerender({ p: "a b.md" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/repos/r1/context/file?path=a%20b.md");
  });
});

describe("context saves", () => {
  it("PUTs roots and invalidates roots + listing keys", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({ roots: [] });
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useSaveContextRoots("r1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync([]);
    });
    expect(put).toHaveBeenCalledWith("/repos/r1/context/roots", { roots: [] });
    expect(spy).toHaveBeenCalledWith({ queryKey: contextKeys.roots("r1") });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["context"] });
  });

  it("PUTs agent paths in order and invalidates its key + listing", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({ paths: ["b.md", "a.md"], inherited: [] });
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useSaveAgentContext("a1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(["b.md", "a.md"]);
    });
    expect(put).toHaveBeenCalledWith("/agents/a1/context", { paths: ["b.md", "a.md"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: contextKeys.agent("a1") });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["context"] });
  });

  it("PUTs skill paths and invalidates its key + listing", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({ paths: ["a.md"] });
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useSaveSkillContext("s1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(["a.md"]);
    });
    expect(put).toHaveBeenCalledWith("/skills/s1/context", { paths: ["a.md"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: contextKeys.skill("s1") });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["context"] });
  });
});

describe("useWriteContextFile", () => {
  it("PUTs path+content and invalidates the repo's context prefix (listing and doc)", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({ path: "a.md", content: "x", size_bytes: 1, tokens: 1 });
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useWriteContextFile("r1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ path: "a.md", content: "x" });
    });
    expect(put).toHaveBeenCalledWith("/repos/r1/context/file", { path: "a.md", content: "x" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["context", "r1"] });
  });
});
