import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ApiError } from "@/lib/api";
import ci from "../../../../../../../../../../../../messages/en/ci.json";
import { ErrorNote } from "./ErrorNote";

afterEach(cleanup);

function renderNote(error: unknown) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci }}>
      <ErrorNote error={error} />
    </NextIntlClientProvider>,
  );
}

// Expected texts are written out here (not read from the catalogue) so a swapped key in the mapping fails.
const EXPECTED: Record<string, RegExp> = {
  no_repository: /not connected to the workspace any more/,
  repo_not_accessible: /GitHub can't see this repository/,
  token_missing: /No GitHub token is configured/,
  token_permission_missing: /lacks permission.*Contents, Pull requests and Workflows write access/,
  agent_not_exportable: /Only agents that use the OpenRouter provider/,
  runner_bundle_missing: /runner bundle isn't built/,
  workflow_invalid: /didn't pass validation/,
  github_unavailable: /GitHub didn't respond/,
};

describe("ErrorNote", () => {
  it.each(Object.entries(EXPECTED))("renders the own message for the server code %s, not the server text", (code, text) => {
    renderNote(new ApiError("raw server text", 400, code));
    expect(screen.getByRole("alert")).toHaveTextContent(text);
    expect(screen.queryByText("raw server text")).not.toBeInTheDocument();
  });

  it("falls back to the server's message for an unknown code or no code", () => {
    renderNote(new ApiError("Quota exceeded", 429, "rate_limited"));
    expect(screen.getByRole("alert")).toHaveTextContent("Quota exceeded");
    cleanup();
    renderNote(new ApiError("502 Bad Gateway", 502));
    expect(screen.getByRole("alert")).toHaveTextContent("502 Bad Gateway");
  });

  it("falls back to the generic message for anything that is not an ApiError", () => {
    renderNote(new TypeError("fetch failed"));
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong while talking to the DevDigest engine.");
  });
});
