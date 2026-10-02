import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../../../messages/en/context.json";
import { ToastProvider } from "@/lib/toast";

const mutate = vi.fn();
const doc = (path: string, tokens: number) => ({
  path,
  type: "specs" as const,
  size_bytes: 1,
  tokens,
  updated_at: "2026-10-01T00:00:00.000Z",
  used_by_agents: 0,
});
const state = {
  repoId: "r1" as string | null,
  listing: { roots: ["specs/**"], status: "ok", scanned_at: "x", total_tokens: 30, files: [doc("specs/a.md", 10), doc("specs/b.md", 20)] },
  context: {
    paths: ["specs/a.md", "specs/gone.md"],
    inherited: [{ skill_id: "s1", skill_name: "Sec", paths: ["specs/b.md"] }],
  },
};
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: state.repoId }) }));
vi.mock("@/lib/hooks/context", () => ({
  useContextDocs: () => ({ data: state.listing, isError: false, refetch: vi.fn() }),
  useAgentContext: () => ({ data: state.context, isError: false, refetch: vi.fn() }),
  useSaveAgentContext: () => ({ mutate, isPending: false }),
  useContextDoc: () => ({ data: { path: "specs/a.md", content: "# Hello doc" }, isLoading: false, isError: false }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  state.repoId = "r1";
});

const AGENT = { id: "ag1" } as Agent;
const renderTab = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, context: contextMessages }}>
      <ToastProvider>
        <ContextTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );

describe("ContextTab", () => {
  it("shows a no-repo state without an active repo", () => {
    state.repoId = null;
    renderTab();
    expect(screen.getByText("No repository selected")).toBeInTheDocument();
  });

  it("renders rows, inherited read-only and a detachable missing row; saves ordered paths", () => {
    renderTab();
    expect(screen.getByText("specs/gone.md")).toBeInTheDocument();
    expect(screen.getByText("via Sec")).toBeInTheDocument();
    // only listed non-inherited rows have a checkbox: a, gone, b
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Save context" }));
    expect(mutate.mock.calls[0]![0]).toEqual(["specs/a.md", "specs/gone.md"]);
  });

  it("reorders and detaches before saving", () => {
    renderTab();
    fireEvent.click(screen.getByLabelText("Move specs/gone.md up"));
    fireEvent.click(screen.getByRole("button", { name: "Save context" }));
    expect(mutate.mock.calls[0]![0]).toEqual(["specs/gone.md", "specs/a.md"]);

    mutate.mockReset();
    fireEvent.click(screen.getByLabelText("Attach specs/gone.md"));
    fireEvent.click(screen.getByRole("button", { name: "Save context" }));
    expect(mutate.mock.calls[0]![0]).toEqual(["specs/a.md"]);
  });

  it("previews a document", () => {
    renderTab();
    fireEvent.click(screen.getByLabelText("Preview specs/a.md"));
    expect(screen.getByText("Hello doc")).toBeInTheDocument();
  });

  it("follows the refetched saved paths after a save instead of keeping a stale draft", () => {
    const view = renderTab();
    fireEvent.click(screen.getByLabelText("Attach specs/a.md")); // draft: detach a
    mutate.mockImplementation((_paths: string[], opts: { onSuccess: () => void }) => opts.onSuccess());
    fireEvent.click(screen.getByRole("button", { name: "Save context" }));
    // server now reports a different saved set (e.g. changed elsewhere)
    state.context = { paths: ["specs/a.md"], inherited: [] };
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, context: contextMessages }}>
        <ToastProvider>
          <ContextTab agent={AGENT} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText("Attach specs/a.md")).toBeChecked();
    expect(screen.queryByText("specs/gone.md")).not.toBeInTheDocument();
  });
});
