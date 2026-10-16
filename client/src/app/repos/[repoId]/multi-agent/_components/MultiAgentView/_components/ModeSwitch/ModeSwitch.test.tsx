import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import multiAgent from "../../../../../../../../../messages/en/multiAgent.json";
import { ModeSwitch } from "./ModeSwitch";

afterEach(cleanup);

const renderSwitch = (mode: "columns" | "tabs", onChange = vi.fn()) => {
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent }}>
      <ModeSwitch mode={mode} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
};

describe("ModeSwitch", () => {
  it("marks the selected option pressed, styles it differently, and reports the other on click", () => {
    const onChange = renderSwitch("columns");
    expect(screen.getByRole("group", { name: "View mode" })).toBeInTheDocument();

    const columns = screen.getByRole("button", { name: "Columns" });
    const tabs = screen.getByRole("button", { name: "Tabs" });
    expect(columns).toHaveAttribute("aria-pressed", "true");
    expect(tabs).toHaveAttribute("aria-pressed", "false");
    expect(columns.getAttribute("style")).not.toBe(tabs.getAttribute("style"));

    fireEvent.click(tabs);
    expect(onChange).toHaveBeenCalledWith("tabs");
  });

  it("flips the pressed state with the mode prop", () => {
    renderSwitch("tabs");
    expect(screen.getByRole("button", { name: "Tabs" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Columns" })).toHaveAttribute("aria-pressed", "false");
  });
});
