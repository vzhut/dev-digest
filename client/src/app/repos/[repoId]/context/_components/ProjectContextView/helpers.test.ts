import { describe, it, expect } from "vitest";
import type { ContextDoc } from "@devdigest/shared";
import { byteLength, areaOf, areaTone, effectiveSelection, parseRoots, rootsToText, splitPath } from "./helpers";

const d = (path: string): ContextDoc => ({ path, type: "docs", size_bytes: 1, tokens: 1, updated_at: "x", used_by_agents: 0 });

describe("roots text", () => {
  it("parses one root per line, trimming and dropping blanks; empty text resets", () => {
    expect(parseRoots(" docs/** \n\n specs/**\n")).toEqual(["docs/**", "specs/**"]);
    expect(parseRoots("  \n")).toEqual([]);
    expect(rootsToText(["a", "b"])).toBe("a\nb");
  });
});

describe("selection and path split", () => {
  it("falls back to the first doc when nothing, or a vanished path, is selected", () => {
    const files = [d("a/x.md"), d("b/y.md")];
    expect(effectiveSelection(files, null)?.path).toBe("a/x.md");
    expect(effectiveSelection(files, "gone.md")?.path).toBe("a/x.md");
    expect(effectiveSelection(files, "b/y.md")?.path).toBe("b/y.md");
    expect(effectiveSelection([], "b/y.md")).toBeNull();
  });
  it("splits directory and basename", () => {
    expect(splitPath("docs/guide/a.md")).toEqual({ dir: "docs/guide/", base: "a.md" });
    expect(splitPath("README.md")).toEqual({ dir: "", base: "README.md" });
  });
});

describe("area tag", () => {
  it("uses the uppercased first segment, ROOT for root-level files", () => {
    expect(areaOf("client/src/a.md")).toBe("CLIENT");
    expect(areaOf("reviewer-core/README.md")).toBe("REVIEWER-CORE");
    expect(areaOf("README.md")).toBe("ROOT");
  });
  it("colours deterministically: known areas fixed, unknown hashed, ROOT neutral", () => {
    expect(areaTone("CLIENT")).toEqual(areaTone("CLIENT"));
    expect(areaTone("CLIENT")).not.toEqual(areaTone("SERVER"));
    expect(areaTone("WHATEVER")).toEqual(areaTone("WHATEVER"));
    expect(areaTone("ROOT").background).toBe("var(--bg-hover)");
  });
});

describe("byteLength", () => {
  it("counts UTF-8 bytes, not characters", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("é")).toBe(2);
  });
});
