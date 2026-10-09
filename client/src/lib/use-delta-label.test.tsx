import { describe, it, expect } from "vitest";
import React from "react";
import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en/eval.json";
import { useDeltaLabel } from "./use-delta-label";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
    {children}
  </NextIntlClientProvider>
);

describe("useDeltaLabel", () => {
  it("words a change as an arrow, a sign and points through i18n; unknown is a dash", () => {
    const { result } = renderHook(() => useDeltaLabel(), { wrapper });
    const label = result.current;
    expect(label(0.06)).toBe("▲ +6 pts");
    expect(label(-0.123)).toBe("▼ −12.3 pts");
    expect(label(0)).toBe("▬ 0 pts");
    expect(label(0.0001)).toBe("▬ 0 pts");
    expect(label(null)).toBe("—");
    expect(label(undefined)).toBe("—");
  });
});
