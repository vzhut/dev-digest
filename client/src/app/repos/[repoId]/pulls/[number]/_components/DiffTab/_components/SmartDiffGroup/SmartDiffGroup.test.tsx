import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import { SmartDiffGroup } from "./SmartDiffGroup";

afterEach(cleanup);

const renderGroup = (props: Partial<React.ComponentProps<typeof SmartDiffGroup>>) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      <SmartDiffGroup label="Core" fileCount={3} {...props}>
        <div />
      </SmartDiffGroup>
    </NextIntlClientProvider>,
  );

describe("SmartDiffGroup header", () => {
  it.each([
    ["CRITICAL", "var(--crit)"],
    ["WARNING", "var(--warn)"],
    ["SUGGESTION", "var(--sugg)"],
  ])("colours the dot by top severity %s and puts it before the file count", (sev, color) => {
    renderGroup({ findingFilesCount: 2, topSeverity: sev });
    expect(screen.getByTestId("group-dot").style.background).toBe(color);
    const dot = screen.getByTitle(/2 files with findings/i);
    const count = screen.getByText(/3 files/i);
    expect(dot.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Core").compareDocumentPosition(dot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hides the dot when no file has findings", () => {
    renderGroup({});
    expect(screen.queryByTestId("group-dot")).toBeNull();
  });

  it("shows the role square and muted description before the right cluster", () => {
    renderGroup({ description: "Verifies the change", color: "var(--ok)", findingFilesCount: 1 });
    expect(screen.getByTestId("group-square").style.background).toBe("var(--ok)");
    expect(screen.getByTestId("group-square").getAttribute("aria-hidden")).toBe("true");
    const desc = screen.getByText("Verifies the change");
    expect(screen.getByText("Core").compareDocumentPosition(desc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(desc.compareDocumentPosition(screen.getByText(/3 files/i)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
