import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import skills from "../../../../../../../../../../messages/en/skills.json";
import context from "../../../../../../../../../../messages/en/context.json";
import common from "../../../../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const saveMutate = vi.fn();
const doc = (path: string, type: string, tokens: number) => ({
  path,
  type,
  size_bytes: tokens * 4,
  tokens,
  updated_at: "2026-10-01T00:00:00.000Z",
  used_by_agents: 0,
});
const LISTING = {
  roots: ["docs/**"],
  status: "ok",
  scanned_at: "2026-10-01T00:00:00.000Z",
  total_tokens: 390,
  files: [doc("specs/a.md", "specs", 100), doc("specs/b.md", "specs", 250), doc("docs/guide.md", "docs", 40)],
};
let repoId: string | null = "r1";
let savedPaths: string[] = ["specs/a.md", "specs/b.md"];

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId }) }));
vi.mock("@/lib/hooks/context", () => ({
  useContextDocs: () => ({ data: LISTING, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkillContext: () => ({ data: { paths: savedPaths }, isLoading: false, isError: false, refetch: vi.fn() }),
  useSaveSkillContext: () => ({ mutate: saveMutate, isPending: false }),
  useContextDoc: (_r: string, path: string) => ({
    data: { path, content: "# Hello from doc" },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { ProjectContextSection } from "./ProjectContextSection";

afterEach(() => {
  cleanup();
  saveMutate.mockReset();
  repoId = "r1";
  savedPaths = ["specs/a.md", "specs/b.md"];
});

const wrap = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ skills, context, common }}>
      <ToastProvider>
        <ProjectContextSection skillId="s1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );

describe("ProjectContextSection", () => {
  it("shows heading, inherit note, attached count and the SERIALIZES AS panel in attached order", () => {
    wrap();
    expect(screen.getByRole("heading", { name: "Project context to use" })).toBeInTheDocument();
    expect(screen.getByText(/inherits these documents/i)).toBeInTheDocument();
    expect(screen.getByText("2 of 3 attached")).toBeInTheDocument();
    const pre = document.querySelector("pre")!;
    expect(pre.textContent).toBe("## Project context\ndocument: specs/a.md\ndocument: specs/b.md");
    expect(pre.textContent).not.toContain("Project specifications");
    expect(screen.getByText(/read at run time/i)).toBeInTheDocument();
  });

  it("filters, previews a document, and saves only on explicit save with the new path", () => {
    wrap();
    expect(screen.getByRole("button", { name: /Save context/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Filter documents by path"), { target: { value: "guide" } });
    expect(screen.queryByText("specs/a.md", { selector: "span, div" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview docs/guide.md" }));
    expect(screen.getByText("Hello from doc")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Attach docs/guide.md" }));
    expect(saveMutate).not.toHaveBeenCalled();
    expect(document.querySelector("pre")!.textContent).toContain("document: docs/guide.md");
    fireEvent.click(screen.getByRole("button", { name: /Save context/ }));
    expect(saveMutate.mock.calls[0]?.[0]).toEqual(["specs/a.md", "specs/b.md", "docs/guide.md"]);
  });

  it("shows a no-repo state without the checklist", () => {
    repoId = null;
    wrap();
    expect(screen.getByText(/Select a repository/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
