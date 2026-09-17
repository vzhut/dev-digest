/**
 * FindingsPopover — the hover preview shared by the PR list FINDINGS column and
 * the PR timeline. Load-bearing rules: the header counts THIS run's findings,
 * previews are read-only (no buttons/links), and nothing inside leaks a click to
 * the row it sits in (the PR list row navigates on click).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingPreview, Severity } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { FindingsPopover } from "./FindingsPopover";
import { fileLineLabel, popoverPosition } from "./helpers";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function preview(id: string, severity: Severity, over: Partial<FindingPreview> = {}): FindingPreview {
  return {
    id,
    severity,
    category: "security",
    title: `Title ${id}`,
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    confidence: 0.98,
    summary: `Summary ${id}`,
    ...over,
  };
}

const FINDINGS = [
  preview("c1", "CRITICAL"),
  preview("w1", "WARNING", { category: "perf", file: "src/api/users.ts", start_line: 45, end_line: 52, confidence: 0.86 }),
  preview("w2", "WARNING"),
];

function renderPopover(findings: FindingPreview[], onParentClick = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <div onClick={onParentClick}>
        <FindingsPopover findings={findings} />
      </div>
    </NextIntlClientProvider>,
  );
  return { onParentClick, trigger: screen.getByRole("button", { name: /findings? in this run/ }) };
}

describe("FindingsPopover", () => {
  it("shows one icon + count per present severity, in severity order", () => {
    const { trigger } = renderPopover(FINDINGS);
    expect(trigger).toHaveTextContent("12"); // "1" CRITICAL, then "2" WARNING
    expect(trigger.textContent).toBe("12");
  });

  it("renders nothing for an empty run", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPopover findings={[]} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens on hover with the run's count and a read-only preview per finding", () => {
    const { trigger } = renderPopover(FINDINGS);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(trigger);
    const popover = screen.getByRole("tooltip");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(popover).getByText("3 findings in this run")).toBeInTheDocument();

    expect(within(popover).getByText("Title w1")).toBeInTheDocument();
    expect(within(popover).getByText("perf")).toBeInTheDocument();
    expect(within(popover).getByText("src/api/users.ts:45-52")).toBeInTheDocument();
    expect(within(popover).getByText("86% conf")).toBeInTheDocument();
    expect(within(popover).getByText("Summary w1")).toBeInTheDocument();

    // Read-only: no actions and no links anywhere in the popover.
    expect(within(popover).queryAllByRole("button")).toHaveLength(0);
    expect(within(popover).queryAllByRole("link")).toHaveLength(0);
  });

  it("uses the singular header for one finding", () => {
    const { trigger } = renderPopover([preview("c1", "CRITICAL")]);
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText("1 finding in this run")).toBeInTheDocument();
  });

  it("opens on keyboard focus and closes on Escape", () => {
    const { trigger } = renderPopover(FINDINGS);
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("stays open while the pointer moves from the trigger into the popover, closes after leaving", () => {
    vi.useFakeTimers();
    const { trigger } = renderPopover(FINDINGS);
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(screen.getByRole("tooltip"));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole("tooltip"));
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes when the page scrolls, but not when the popover itself scrolls", () => {
    const { trigger } = renderPopover(FINDINGS);
    fireEvent.mouseEnter(trigger);
    fireEvent.scroll(screen.getByRole("tooltip"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.scroll(window);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("never lets a click reach the parent row (trigger or inside the portalled popover)", () => {
    const { trigger, onParentClick } = renderPopover(FINDINGS);
    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument(); // click opens (touch)
    fireEvent.click(screen.getByText("Title c1"));
    expect(onParentClick).not.toHaveBeenCalled();
  });
});

describe("fileLineLabel", () => {
  it("formats a single line and a range", () => {
    expect(fileLineLabel({ file: "a.ts", start_line: 3, end_line: 3 })).toBe("a.ts:3");
    expect(fileLineLabel({ file: "a.ts", start_line: 3, end_line: 9 })).toBe("a.ts:3-9");
  });
});

describe("popoverPosition", () => {
  const viewport = { width: 1200, height: 800 };
  const trigger = (top: number) => ({ left: 100, top, bottom: top + 20 });
  const sized = (height: number) => ({ width: 400, height, gap: 6 });

  it("opens below the trigger when the whole popover fits there", () => {
    expect(popoverPosition(trigger(100), viewport, sized(500))).toEqual({ left: 100, top: 126 });
  });

  it("flips above when it only fits above", () => {
    expect(popoverPosition(trigger(600), viewport, sized(500))).toEqual({ left: 100, top: 94 });
  });

  it("shifts into the viewport when it fits neither side but fits the screen", () => {
    // 700px tall: no room below (y=420) or above (y=400) — pin its bottom to the margin.
    expect(popoverPosition(trigger(400), viewport, sized(700))).toEqual({ left: 100, top: 92 });
  });

  it("scrolls only when taller than the viewport itself", () => {
    expect(popoverPosition(trigger(400), viewport, sized(2000))).toEqual({ left: 100, top: 8, maxHeight: 784 });
  });

  it("clamps horizontally inside the viewport", () => {
    expect(popoverPosition({ left: 1100, top: 100, bottom: 120 }, viewport, sized(100)).left).toBe(1200 - 400 - 8);
  });
});
