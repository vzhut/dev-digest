/**
 * DocPreview — rendered markdown of one doc. Load-bearing: raw HTML in a doc
 * (e.g. <script>) must stay inert.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/context.json";
import { DocPreview } from "./DocPreview";

const useContextDoc = vi.fn();
vi.mock("@/lib/hooks/context", () => ({ useContextDoc: (...a: unknown[]) => useContextDoc(...a) }));

beforeEach(() => useContextDoc.mockReset());
afterEach(cleanup);

const renderPreview = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <DocPreview repoId="r1" path="specs/a.md" />
    </NextIntlClientProvider>,
  );

describe("DocPreview", () => {
  it("renders headings and keeps <script> inert", () => {
    useContextDoc.mockReturnValue({
      data: { path: "specs/a.md", content: "# Title\n\nbody\n\n<script>window.__pwned = 1</script>" },
      isLoading: false,
      isError: false,
    });
    const { container } = renderPreview();
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    expect(useContextDoc).toHaveBeenCalledWith("r1", "specs/a.md");
  });

  it("shows loading, then an error with retry", () => {
    useContextDoc.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { unmount } = renderPreview();
    expect(screen.getByRole("status", { name: "Loading document" })).toBeInTheDocument();
    unmount();

    const refetch = vi.fn();
    useContextDoc.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderPreview();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the path heading by default and omits it with hideTitle", () => {
    useContextDoc.mockReturnValue({ data: { path: "specs/a.md", content: "# T" }, isLoading: false, isError: false });
    const first = renderPreview();
    expect(screen.getByRole("heading", { name: "specs/a.md" })).toBeInTheDocument();
    first.unmount();
    render(
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <DocPreview repoId="r1" path="specs/a.md" hideTitle />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("heading", { name: "specs/a.md" })).not.toBeInTheDocument();
  });
});
