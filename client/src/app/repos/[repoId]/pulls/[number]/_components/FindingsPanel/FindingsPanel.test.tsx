import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, Severity } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate, isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

function finding(id: string, severity: Severity, title: string, confidence = 0.95): FindingRecord {
  return {
    id,
    severity,
    category: "security",
    title,
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const FINDINGS: FindingRecord[] = [finding("f1", "CRITICAL", "Hardcoded secret")];

const MIXED: FindingRecord[] = [
  finding("c1", "CRITICAL", "Hardcoded secret"),
  finding("c2", "CRITICAL", "SQL injection", 0.5),
  finding("w1", "WARNING", "No rate limit"),
  finding("s1", "SUGGESTION", "Rename variable", 0.4),
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const pill = (severity: string) =>
  screen.getByRole("button", { name: new RegExp(`Show only ${severity} findings`) });
const queryPill = (severity: string) =>
  screen.queryByRole("button", { name: new RegExp(`Show only ${severity} findings`) });
const cardTitles = () =>
  Array.from(document.querySelectorAll("[data-finding-id]")).map((el) => el.getAttribute("data-finding-id"));

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity pills", () => {
  it("shows a pill per present severity whose count matches the cards", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(within(pill("CRITICAL")).getByText("2")).toBeInTheDocument();
    expect(within(pill("WARNING")).getByText("1")).toBeInTheDocument();
    expect(within(pill("SUGGESTION")).getByText("1")).toBeInTheDocument();
    expect(cardTitles()).toHaveLength(4);
  });

  it("renders no pill row when there are no findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: "Filter findings by severity" })).not.toBeInTheDocument();
  });

  it("filters to one severity on click and restores the full list on a second click", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);

    fireEvent.click(pill("CRITICAL"));
    expect(pill("CRITICAL")).toHaveAttribute("aria-pressed", "true");
    expect(cardTitles()).toEqual(["c1", "c2"]);
    // Other pills keep their counts so the user can switch directly.
    expect(within(pill("WARNING")).getByText("1")).toBeInTheDocument();

    fireEvent.click(pill("WARNING"));
    expect(cardTitles()).toEqual(["w1"]);

    fireEvent.click(pill("WARNING"));
    expect(pill("WARNING")).toHaveAttribute("aria-pressed", "false");
    expect(cardTitles()).toHaveLength(4);
  });

  it("re-counts from what hide-low-confidence leaves visible", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));

    expect(within(pill("CRITICAL")).getByText("1")).toBeInTheDocument();
    expect(queryPill("SUGGESTION")).not.toBeInTheDocument();
    expect(cardTitles()).toEqual(["c1", "w1"]);
  });

  it("clears the filter when hide-low-confidence removes the active severity", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(pill("SUGGESTION"));
    expect(cardTitles()).toEqual(["s1"]);

    fireEvent.click(screen.getByRole("switch"));
    expect(queryPill("SUGGESTION")).not.toBeInTheDocument();
    expect(cardTitles()).toEqual(["c1", "w1"]);
    // Turning the toggle back off must not silently re-apply the old filter.
    fireEvent.click(screen.getByRole("switch"));
    expect(cardTitles()).toHaveLength(4);
  });

  it("exposes the visible count as a named list", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(screen.getByRole("list", { name: "4 findings shown" })).toBeInTheDocument();
    fireEvent.click(pill("WARNING"));
    expect(screen.getByRole("list", { name: "1 finding shown" })).toBeInTheDocument();
  });

  it("puts keyboard focus back on the first card when the visible list shrinks", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    // Focus the last card (index 3, "s1"), then hide low confidence → only 2 cards left.
    for (let i = 0; i < 3; i++) fireEvent.keyDown(window, { key: "j" });
    fireEvent.click(screen.getByRole("switch"));

    // `a` must act on a card that is actually shown — the first one — not do nothing.
    fireEvent.keyDown(window, { key: "a" });
    expect(mutate).toHaveBeenCalledWith({ findingId: "c1", action: "accept", prId: "pr1" });
  });
});
