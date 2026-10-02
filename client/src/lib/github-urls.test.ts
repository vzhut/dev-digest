import { describe, it, expect } from "vitest";
import { githubBlobUrl, githubTreeUrl } from "./github-urls";

describe("github urls", () => {
  it("pins a dir to a commit with a tree url and encodes segments", () => {
    expect(githubTreeUrl("o/r", "abc1234", "src/my dir")).toBe(
      "https://github.com/o/r/tree/abc1234/src/my%20dir",
    );
    expect(githubBlobUrl("o/r", "abc1234", "a/b.ts")).toBe(
      "https://github.com/o/r/blob/abc1234/a/b.ts",
    );
  });
});
