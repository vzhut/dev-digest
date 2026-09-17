/**
 * SeverityPills — renders the counts it is given (grouping happens upstream in
 * `severityCounts`) as toggle buttons; the panel owns the filter state.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Severity } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { SeverityPills } from "./SeverityPills";

afterEach(cleanup);

const COUNTS = [
  { severity: "CRITICAL" as const, count: 3 },
  { severity: "WARNING" as const, count: 5 },
  { severity: "SUGGESTION" as const, count: 2 },
];

function renderPills(active: Severity | null, onToggle = vi.fn(), counts = COUNTS) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityPills counts={counts} active={active} onToggle={onToggle} />
    </NextIntlClientProvider>,
  );
  return onToggle;
}

describe("SeverityPills", () => {
  it("renders 'N SEVERITY' pills in the given order", () => {
    renderPills(null);
    const pills = screen.getAllByRole("button");
    expect(pills.map((p) => p.textContent)).toEqual(["3CRITICAL", "5WARNING", "2SUGGESTION"]);
    expect(pills.every((p) => p.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("names each pill with its severity and count", () => {
    renderPills(null);
    expect(screen.getByRole("button", { name: "Show only WARNING findings (5)" })).toBeInTheDocument();
  });

  it("marks only the active pill as pressed", () => {
    renderPills("WARNING");
    expect(screen.getByRole("button", { name: /WARNING/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /CRITICAL/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the clicked severity to the owner", () => {
    const onToggle = renderPills("WARNING");
    fireEvent.click(screen.getByRole("button", { name: /SUGGESTION/ }));
    expect(onToggle).toHaveBeenCalledWith("SUGGESTION");
  });

  it("renders nothing when there are no counts", () => {
    renderPills(null, vi.fn(), []);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});
