/**
 * AddRepoView — the only field is the repo URL. Submit navigates to the new
 * repo's PR list; a failed add shows the API's own message (apiErrorMessage)
 * and keeps the user on the screen. Esc closes, as the footer advertises.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/repos.json";
import { ApiError } from "@/lib/api";

const push = vi.fn();
const mutateAsync = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/lib/hooks/core", () => ({ useAddRepo: () => ({ mutateAsync, isPending: false }) }));

import { AddRepoView } from "./AddRepoView";

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ repos: messages }}>
      <AddRepoView />
    </NextIntlClientProvider>,
  );
}

const urlField = () => screen.getByPlaceholderText("https://github.com/owner/repo");
const submitBtn = () => screen.getByRole("button", { name: "Add repository" });

beforeEach(() => {
  push.mockReset();
  mutateAsync.mockReset();
});
afterEach(cleanup);

describe("AddRepoView", () => {
  it("cannot submit an empty URL", () => {
    renderView();
    expect(submitBtn()).toBeDisabled();
  });

  it("trims the URL and lands on the new repo's PR list", async () => {
    mutateAsync.mockResolvedValue({ id: "repo-9" });
    renderView();
    fireEvent.change(urlField(), { target: { value: "  https://github.com/acme/api  " } });
    fireEvent.click(submitBtn());

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("https://github.com/acme/api"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/repos/repo-9/pulls"));
  });

  it("shows the API's message on failure and stays on the screen", async () => {
    mutateAsync.mockRejectedValue(new ApiError("Repository is private", 403));
    renderView();
    fireEvent.change(urlField(), { target: { value: "https://github.com/acme/secret" } });
    fireEvent.click(submitBtn());

    expect(await screen.findByText("Repository is private")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the failure carries none", async () => {
    mutateAsync.mockRejectedValue(new TypeError("Failed to fetch"));
    renderView();
    fireEvent.change(urlField(), { target: { value: "https://github.com/acme/api" } });
    fireEvent.click(submitBtn());

    expect(await screen.findByText("Could not add repository")).toBeInTheDocument();
  });

  it("Esc closes back to the app root", () => {
    renderView();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(push).toHaveBeenCalledWith("/");
  });
});
