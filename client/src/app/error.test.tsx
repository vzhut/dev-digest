import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en/common.json";
import RouteError from "./error";

afterEach(cleanup);

describe("route error boundary", () => {
  it("shows the app's error state and retries via reset()", () => {
    const reset = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <NextIntlClientProvider locale="en" messages={{ common: messages }}>
        <RouteError error={new Error("boom")} reset={reset} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("This page crashed");
    fireEvent.click(screen.getByText("Retry"));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
