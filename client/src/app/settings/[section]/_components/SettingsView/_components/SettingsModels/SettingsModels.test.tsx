import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import settingsMessages from "../../../../../../../../messages/en/settings.json";

const update = vi.fn();
vi.mock("@/lib/hooks/core", () => ({
  useSettings: () => ({ data: { feature_models: {} } }),
  useUpdateSettings: () => ({ mutate: update }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useProviderModels: () => ({
    data: [
      { id: "deepseek/deepseek-v4-flash", pricing: null, contextLength: null },
      { id: "google/gemini-flash", pricing: null, contextLength: null },
    ],
  }),
}));

import { SettingsModels } from "./SettingsModels";

afterEach(cleanup);

describe("SettingsModels — intent classifier row", () => {
  it("defaults to the cheap OpenRouter model and saves a pick as an openrouter choice", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ settings: settingsMessages }}>
        <SettingsModels />
      </NextIntlClientProvider>,
    );

    const label = screen.getByText("PR Review · Intent");
    const row = label.closest("div")!.parentElement!.parentElement!;
    expect(within(row).getByText("default")).toBeInTheDocument();
    expect(within(row).getByText("deepseek/deepseek-v4-flash")).toBeInTheDocument();

    fireEvent.click(within(row).getByText("deepseek/deepseek-v4-flash"));
    fireEvent.click(await screen.findByText("google/gemini-flash"));
    expect(update).toHaveBeenCalledWith({
      feature_models: { review_intent: { provider: "openrouter", model: "google/gemini-flash" } },
    });
  });
});
