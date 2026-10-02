import { describe, expect, it } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("matches the onboarding tour only on the repo-scoped route", () => {
    expect(activeKeyFor("/repos/r1/onboarding")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/r1/onboarding/")).toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).not.toBe("onboarding-tour");
    expect(activeKeyFor("/repos/r1/onboarding-notes")).not.toBe("onboarding-tour");
  });

  it("keeps the other repo-scoped keys", () => {
    expect(activeKeyFor("/repos/r1/context")).toBe("context");
    expect(activeKeyFor("/repos/r1/pulls")).toBe("pulls");
    expect(activeKeyFor("/repos/r1/conventions")).toBe("conventions");
  });
});
