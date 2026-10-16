/**
 * LearnAction (AC-37/38): one click saves the finding as a learning; once learned_at is set the
 * button is pressed and disabled; a failure shows an inline alert and leaves the button enabled.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import prReview from "../../../../messages/en/prReview.json";

const mutate = vi.fn();
const state: { isPending: boolean; isError: boolean; error: unknown } = { isPending: false, isError: false, error: null };
vi.mock("@/lib/hooks/reviews", () => ({
  useLearnFinding: () => ({ mutate, ...state }),
}));

import { LearnAction } from "./LearnAction";

beforeEach(() => {
  mutate.mockReset();
  state.isPending = false;
  state.isError = false;
  state.error = null;
});
afterEach(cleanup);

const finding = (over: Partial<FindingRecord> = {}) => ({ id: "f1", learned_at: null, ...over }) as FindingRecord;

function renderAction(f: FindingRecord, onParentClick = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      <div onClick={onParentClick}>
        <LearnAction finding={f} prId="pr1" multiAgentRunId="m1" />
      </div>
    </NextIntlClientProvider>,
  );
  return onParentClick;
}

describe("LearnAction", () => {
  it("saves the finding on click (with its PR and multi-agent run) without triggering the parent", () => {
    const onParentClick = renderAction(finding());
    const btn = screen.getByRole("button", { name: "Learn" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(btn);
    expect(mutate).toHaveBeenCalledWith({ findingId: "f1", prId: "pr1", multiAgentRunId: "m1" });
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("is pressed and disabled once the finding was learned", () => {
    renderAction(finding({ learned_at: "2026-10-13T10:00:00.000Z" }));
    const btn = screen.getByRole("button", { name: "Learn" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("is disabled while saving", () => {
    state.isPending = true;
    renderAction(finding());
    expect(screen.getByRole("button", { name: /Learn/ })).toBeDisabled();
  });

  it("shows the server message inline on failure and stays enabled for a retry", () => {
    state.isError = true;
    state.error = new ApiError("Learning limit reached", 429);
    renderAction(finding());
    expect(screen.getByRole("alert")).toHaveTextContent("Learning limit reached");
    const btn = screen.getByRole("button", { name: "Learn" });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic message for a non-API error", () => {
    state.isError = true;
    state.error = new Error("network down");
    renderAction(finding());
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save this learning");
  });
});
