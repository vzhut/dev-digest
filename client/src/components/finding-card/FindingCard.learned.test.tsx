import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import prReview from "../../../messages/en/prReview.json";

vi.mock("@/lib/hooks/reviews", () => ({
  useLearnFinding: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));
vi.mock("./EvalCaseAction", () => ({ EvalCaseAction: () => null }));

import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING = {
  id: "f1",
  severity: "WARNING",
  category: "bug",
  title: "Off by one",
  file: "src/a.ts",
  start_line: 3,
  end_line: 3,
  rationale: "r",
  confidence: 0.9,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
  learned_at: null,
} as FindingRecord;

const renderCard = (f: FindingRecord) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      <FindingCard f={f} prId="pr1" defaultExpanded onAction={() => {}} />
    </NextIntlClientProvider>,
  );

describe("FindingCard learned state (AC-37)", () => {
  it("shows a 'learned' tag and a pressed, disabled Learn button once learned_at is set", () => {
    renderCard({ ...FINDING, learned_at: "2026-10-13T10:00:00.000Z" });
    expect(screen.getByText("learned")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Learn" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toBeDisabled();
  });

  it("shows neither the tag nor a pressed button for an unlearned finding", () => {
    renderCard(FINDING);
    expect(screen.queryByText("learned")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Learn" })).toHaveAttribute("aria-pressed", "false");
  });
});
