/**
 * ProjectContextView — listing, select → preview + "Used by N agents", the totals
 * footer (no chunk language), roots editor, and the loading/error/empty/not_cloned states.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { ApiError } from "@/lib/api";
import { NextIntlClientProvider } from "next-intl";
import type { ContextListing } from "@devdigest/shared";
import context from "../../../../../../../messages/en/context.json";

const state: { listing: Partial<ReturnType<typeof listingQuery>> } = { listing: {} };
const refetch = vi.fn();
const saveMutate = vi.fn();
const saveState = { isError: false };
const docOverride: { text: string | null } = { text: null };
const writeMutate = vi.fn();
const writeState: { isError: boolean; isPending: boolean; error: unknown } = { isError: false, isPending: false, error: null };

const doc = (path: string, type: "specs" | "docs", tokens: number, used: number) => ({
  path,
  type,
  size_bytes: tokens * 4,
  tokens,
  updated_at: "2026-10-01T00:00:00.000Z",
  used_by_agents: used,
});

const LISTING: ContextListing = {
  roots: ["docs/**", "specs/**"],
  status: "ok",
  scanned_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  total_tokens: 1240,
  files: [
    doc("specs/a.md", "specs", 300, 3),
    doc("specs/b.md", "specs", 200, 0),
    doc("docs/c.md", "docs", 200, 1),
    doc("docs/d.md", "docs", 200, 0),
    doc("docs/e.md", "docs", 200, 0),
    doc("docs/f.md", "docs", 140, 0),
  ],
};

function listingQuery(over: object = {}) {
  return { data: LISTING, isLoading: false, isError: false, error: null, refetch, isFetching: false, ...over };
}

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb?: { label: string }[] }) => (
    <div>
      <nav aria-label="breadcrumb">{(crumb ?? []).map((c) => c.label).join(" › ")}</nav>
      {children}
    </div>
  ),
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>repo-not-found</div> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/app" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/hooks/context", () => ({
  useContextDocs: () => listingQuery(state.listing),
  useContextDoc: (_r: string, path: string) => ({
    data: { path, content: docOverride.text ?? `# Heading of ${path}\n\n<script>alert(1)</script>` },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useWriteContextFile: () => ({ mutate: writeMutate, isPending: writeState.isPending, isError: writeState.isError, error: writeState.error }),
  useSaveContextRoots: () => ({ mutate: saveMutate, isPending: false, isError: saveState.isError }),
}));

import { ProjectContextView } from "./ProjectContextView";

afterEach(() => {
  cleanup();
  state.listing = {};
  saveState.isError = false;
  writeState.isError = false;
  writeState.isPending = false;
  writeState.error = null;
  docOverride.text = null;
  writeMutate.mockReset();
  refetch.mockReset();
  saveMutate.mockReset();
});

const wrap = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ context }}>
      <ProjectContextView />
    </NextIntlClientProvider>,
  );

describe("ProjectContextView", () => {
  it("shows the totals footer, selects a doc to preview it with its usage, and refreshes", () => {
    wrap();
    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toHaveTextContent("acme/app › Project Context");
    expect(document.body.textContent).not.toMatch(/chunk/i);
    expect(screen.getByText(/6 files · 1,240 tokens total · scanned 3h/)).toBeInTheDocument();
    expect(screen.queryByText(/chunk/i)).not.toBeInTheDocument();
    // first doc is auto-selected: preview + usage without a click, no Edit tab
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("button", { name: /specs\/\s*a\.md/ })).toHaveAttribute("aria-pressed", "true");

    // row anatomy: basename, dimmed directory, area tag carrying the doc type as its title
    const row = screen.getByRole("button", { name: "docs/c.md" });
    expect(row).toHaveTextContent("c.md");
    expect(row).toHaveTextContent("docs/");
    expect(row.querySelector('[title="docs"]')).toHaveTextContent("DOCS");

    fireEvent.click(screen.getByRole("button", { name: /docs\/\s*c\.md/ }));
    expect(screen.getByText("Used by 1 agent")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Heading of docs/c.md" })).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("saves roots one per line, resets with an empty list, and shows a rejected-roots error", () => {
    saveState.isError = true;
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Edit search roots" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Search roots were rejected/);
    fireEvent.change(screen.getByRole("textbox", { name: "Search roots" }), { target: { value: " a/** \n\nb/**" } });
    fireEvent.click(screen.getByRole("button", { name: "Save roots" }));
    expect(saveMutate.mock.calls[0]![0]).toEqual(["a/**", "b/**"]);
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(saveMutate.mock.calls[1]![0]).toEqual([]);
  });

  it("renders loading, error with retry, not_cloned and an empty state naming the roots", () => {
    state.listing = { data: undefined, isLoading: true };
    const first = wrap();
    expect(screen.getByRole("status")).toBeInTheDocument();
    first.unmount();

    state.listing = { data: undefined, isError: true };
    const second = wrap();
    expect(screen.getByText("Couldn’t load project context")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(refetch).toHaveBeenCalled();
    second.unmount();

    state.listing = { data: { ...LISTING, status: "not_cloned", files: [] } };
    const third = wrap();
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    third.unmount();

    state.listing = { data: { ...LISTING, files: [] } };
    wrap();
    expect(screen.getByText("Nothing matches the search roots: docs/**, specs/**")).toBeInTheDocument();
  });
});

describe("ProjectContextView editing", () => {
  const SERVER_TEXT = "# Heading of specs/a.md\n\n<script>alert(1)</script>";
  const openEditor = () => {
    wrap();
    fireEvent.click(screen.getByRole("tab", { name: "Edit" }));
    return screen.getByRole("textbox", { name: "Document text" });
  };

  it("Edit shows the fetched text, the local-only notice, and a disabled Save until the text changes", () => {
    const box = openEditor();
    expect(box).toHaveValue(SERVER_TEXT);
    expect(screen.getByRole("note")).toHaveTextContent(/local clone only.*not committed or pushed to GitHub.*overwritten by the next sync/);
    expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(box, { target: { value: "new text" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(writeMutate.mock.calls[0]![0]).toEqual({ path: "specs/a.md", content: "new text" });

    // success returns to the preview
    act(() => writeMutate.mock.calls[0]![1].onSuccess());
    expect(screen.queryByRole("textbox", { name: "Document text" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the draft and shows an alert when the save fails; disables Save while saving", () => {
    writeState.isError = true;
    const box = openEditor();
    fireEvent.change(box, { target: { value: "draft" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t save the document");
    expect(screen.getByRole("textbox", { name: "Document text" })).toHaveValue("draft");
    cleanup();
    writeState.isError = false;
    writeState.isPending = true;
    const second = openEditor();
    fireEvent.change(second, { target: { value: "draft" } });
    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
  });

  it("blocks content over 1 MiB client-side", () => {
    const box = openEditor();
    fireEvent.change(box, { target: { value: "a".repeat(1_048_577) } });
    expect(screen.getByRole("alert")).toHaveTextContent("larger than 1 MiB");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("asks before discarding a dirty draft on Cancel, Preview tab and selecting another doc; declining keeps it", () => {
    const box = openEditor();
    fireEvent.change(box, { target: { value: "draft" } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Discard unsaved changes?");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Document text" })).toHaveValue("draft");

    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    fireEvent.click(screen.getByRole("button", { name: "docs/c.md" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Document text" })).toHaveValue("draft");
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("textbox", { name: "Document text" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Heading of docs/c.md" })).toBeInTheDocument();

    // a clean editor leaves without asking
    fireEvent.click(screen.getByRole("tab", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("after a successful save the refetched listing and text show: footer total, preview text, back on Preview (AC-35)", () => {
    const box = openEditor();
    expect(screen.getByText(/1,240 tokens total/)).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "# Rewritten title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    act(() => {
      // the server's refetch lands: new doc text, new per-doc and total tokens
      docOverride.text = "# Rewritten title";
      state.listing = {
        data: {
          ...LISTING,
          total_tokens: 1300,
          files: LISTING.files.map((f) => (f.path === "specs/a.md" ? { ...f, tokens: 360, size_bytes: 1440 } : f)),
        },
      };
      writeMutate.mock.calls[0]![1].onSuccess();
    });
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("textbox", { name: "Document text" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rewritten title" })).toBeInTheDocument();
    expect(screen.getByText(/6 files · 1,300 tokens total/)).toBeInTheDocument();
  });

  it("is keyboard operable: roving tabindex tabs with arrow keys, focusable textarea and Save/Cancel", () => {
    wrap();
    const preview = screen.getByRole("tab", { name: "Preview" });
    const edit = screen.getByRole("tab", { name: "Edit" });
    // only the selected tab is in the tab order
    expect(preview).toHaveAttribute("tabindex", "0");
    expect(edit).toHaveAttribute("tabindex", "-1");
    preview.focus();
    expect(preview).toHaveFocus();

    fireEvent.keyDown(preview, { key: "ArrowRight" });
    expect(edit).toHaveAttribute("aria-selected", "true");
    expect(edit).toHaveFocus();
    expect(edit).toHaveAttribute("tabindex", "0");

    const box = screen.getByRole("textbox", { name: "Document text" });
    box.focus();
    expect(box).toHaveFocus();
    fireEvent.change(box, { target: { value: "x" } });
    // Save and Cancel are native buttons: focusable and in the tab order, so Enter/Space activate them
    const save = screen.getByRole("button", { name: "Save" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    for (const b of [save, cancel]) {
      expect(b.tagName).toBe("BUTTON");
      expect(b).not.toHaveAttribute("tabindex", "-1");
      b.focus();
      expect(b).toHaveFocus();
    }

    // arrow back to Preview on a dirty draft asks first (keyboard path honours the guard)
    fireEvent.keyDown(edit, { key: "ArrowLeft" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
  });

  it.each([
    ["a 422 shows the server's message", new ApiError("content exceeds 1 MiB", 422, "validation_error"), "content exceeds 1 MiB"],
    ["a 404 shows 'Document not found'", new ApiError("Document not found", 404, "not_found"), "Document not found"],
    ["a network error shows the generic fallback", new Error("Failed to fetch"), "Couldn’t save the document"],
  ])("AC-37: %s, keeps the draft and leaves Save enabled", (_name, error, text) => {
    writeState.isError = true;
    writeState.error = error;
    const box = openEditor();
    fireEvent.change(box, { target: { value: "my draft" } });
    expect(screen.getByRole("alert")).toHaveTextContent(text);
    expect(screen.getByRole("textbox", { name: "Document text" })).toHaveValue("my draft");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});

describe("ProjectContextView row anatomy (AC-39)", () => {
  it("shows basename, dimmed directory and an area tag titled with the doc type; root files have no directory line", () => {
    state.listing = {
      data: {
        ...LISTING,
        files: [
          doc("client/src/a.md", "docs", 10, 0),
          doc("README.md", "docs", 10, 0),
          doc("docs/guide.md", "docs", 10, 0),
        ],
      },
    };
    wrap();

    const client = screen.getByRole("button", { name: "client/src/a.md" });
    expect(client).toHaveTextContent("a.md");
    const dir = Array.from(client.querySelectorAll("span")).find((el) => el.textContent === "client/src/")!;
    expect(dir).toBeDefined();
    expect(dir.style.color).toBe("var(--text-muted)");
    const base = Array.from(client.querySelectorAll("span")).find((el) => el.textContent === "a.md")!;
    expect(base.style.color).not.toBe("var(--text-muted)");
    const clientTag = client.querySelector('[title="docs"]')!;
    expect(clientTag).toHaveTextContent("CLIENT");

    const root = screen.getByRole("button", { name: "README.md" });
    expect(root.querySelector('[title="docs"]')).toHaveTextContent("ROOT");
    // basename only: no directory element
    expect(Array.from(root.querySelectorAll("span")).some((el) => el.textContent?.endsWith("/"))).toBe(false);

    const docsRow = screen.getByRole("button", { name: "docs/guide.md" });
    expect(docsRow).toHaveTextContent("guide.md");
    expect(docsRow).toHaveTextContent("docs/");
    expect(docsRow.querySelector('[title="docs"]')).toHaveTextContent("DOCS");
  });
});
