import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ApiError } from "@/lib/api";
import ci from "../../../../../../../../../../../../messages/en/ci.json";
import { InstallStep } from "./InstallStep";

afterEach(cleanup);

function renderStep(props: Partial<React.ComponentProps<typeof InstallStep>> = {}) {
  const onMethod = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ ci }}>
      <InstallStep
        repoName="acme/api"
        fileCount={3}
        method="pr"
        onMethod={onMethod}
        previewPending={false}
        previewError={null}
        violationCount={0}
        installResult={undefined}
        installError={null}
        zipDone={false}
        zipError={null}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return onMethod;
}

describe("InstallStep", () => {
  it("offers both methods, switches between them, and always shows the fork note", () => {
    const onMethod = renderStep();
    expect(screen.getByRole("radio", { name: /Open a PR with these files/ })).toBeChecked();
    expect(screen.getByText(/with the 3 generated files/)).toBeInTheDocument();
    expect(screen.getByText(/Pull requests from forks are skipped/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Download a \.zip/ }));
    expect(onMethod).toHaveBeenCalledWith("zip");
  });

  it("pluralises the violation block message and hides it for the zip method", () => {
    renderStep({ violationCount: 2 });
    expect(screen.getByRole("alert")).toHaveTextContent("2 workflow problems block the pull request");
    cleanup();
    renderStep({ violationCount: 2, method: "zip" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows install and zip errors by code, and a preview skeleton while regenerating", () => {
    renderStep({ installError: new ApiError("x", 401, "token_missing"), zipError: new ApiError("y", 502, "github_unavailable") });
    const alerts = screen.getAllByRole("alert");
    expect(alerts[0]).toHaveTextContent("No GitHub token is configured");
    expect(alerts[1]).toHaveTextContent("GitHub didn't respond");
    cleanup();
    renderStep({ previewPending: true });
    expect(screen.getByRole("status", { name: "Generating…" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });
});
