import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Reject"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard scope tag", () => {
  it("shows Out of scope and the original severity only when the intent policy applied", () => {
    const { rerender } = renderWithIntl(<FindingCard f={FINDING} />);
    expect(screen.queryByText("Out of scope")).not.toBeInTheDocument();
    expect(screen.queryByText(/downgraded from/)).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingCard
          f={{ ...FINDING, severity: "SUGGESTION", scope: "out_of_scope", original_severity: "WARNING" }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
    expect(screen.getByText("downgraded from WARNING")).toBeInTheDocument();

    // tag-only case: out of scope, never downgraded (e.g. a SUGGESTION or a security finding)
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingCard f={{ ...FINDING, scope: "out_of_scope", original_severity: null }} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
    expect(screen.queryByText(/downgraded from/)).not.toBeInTheDocument();
  });
});
