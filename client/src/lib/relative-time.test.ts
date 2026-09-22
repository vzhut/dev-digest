import { describe, it, expect } from "vitest";
import { relativeTime } from "./relative-time";

describe("relativeTime", () => {
  const NOW = Date.parse("2026-06-11T12:00:00.000Z");
  it("buckets into now / minutes / hours / days against the injected clock", () => {
    expect(relativeTime("2026-06-11T11:59:40.000Z", NOW)).toBe("now");
    expect(relativeTime("2026-06-11T11:20:00.000Z", NOW)).toBe("40m");
    expect(relativeTime("2026-06-11T09:00:00.000Z", NOW)).toBe("3h");
    expect(relativeTime("2026-06-09T12:00:00.000Z", NOW)).toBe("2d");
  });
  it("never goes negative for a future timestamp", () => {
    expect(relativeTime("2026-06-12T12:00:00.000Z", NOW)).toBe("now");
  });
  it("renders a dash for missing or unparseable input", () => {
    expect(relativeTime(null, NOW)).toBe("—");
    expect(relativeTime("not a date", NOW)).toBe("—");
  });
});
