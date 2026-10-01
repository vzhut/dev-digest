import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Tour } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { ToastProvider } from "@/lib/toast";
import { TourSections } from "./TourSections";

vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: ({ fallback }: { fallback?: React.ReactNode }) => <div>{fallback}</div>,
}));

const SHA = "0123456789abcdef0123456789abcdef01234567";
const USAGE = { llm_calls: 1 as const, tokens_in: 1, tokens_out: 1, cost_usd: 0, model: "m", duration_ms: 1, dropped_items: 0 };

function makeTour(over: Partial<Tour> = {}): Tour {
  return {
    repo_id: "r1",
    generated_at: "2026-10-01T00:00:00Z",
    source_sha: SHA,
    mode: "llm",
    index: { status: "ready", reason: null, files_indexed: 10, files_skipped: 0, files_total: 10, bounded: false, hotness_available: true },
    usage: USAGE,
    architecture: {
      summary_md: "Hello <script>alert(1)</script>\n\n[x](javascript:alert(1))",
      diagram: "not a diagram",
      stack: [{ name: "Fastify", evidence_path: "server/package.json" }],
      structure: [{ path: "server", files: 5 }],
      routes: [],
    },
    critical_paths: [{ path: "server/src/app.ts", reason: "Boots the API", computed_reason: "imported by 9 files · rank p99" }],
    run_locally: [{ command: "pnpm dev", source_path: "package.json", note: null }],
    reading_path: [{ path: "src/a.ts", score: 1, pagerank: 1, hotness: 0, why: null, computed_reason: "imported by 3 files · rank p90" }],
    first_tasks: [
      { title: "Fix a thing", path: "src/a.ts", path_kind: "file", complexity: "low" },
      { title: "Tidy a dir", path: "src/lib", path_kind: "dir", complexity: "high" },
    ],
    ...over,
  };
}

function renderSections(tour: Tour) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ToastProvider>
        <TourSections tour={tour} repoFullName="acme/app" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TourSections", () => {
  it("toggles a card, renders model markdown inert, and links Open at the pinned sha", () => {
    const { container } = renderSections(makeTour());

    const toggle = screen.getByRole("button", { name: "Toggle Architecture" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("x")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "x" })).toBeNull();
    // only the Open links are links; markdown anchors are inert
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^https:\/\/github\.com\/acme\/app\/(blob|tree)\//);
    }
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Fastify")).not.toBeVisible();
    expect(screen.getByText("The architecture diagram could not be rendered.")).not.toBeVisible();

    const file = screen.getAllByRole("link", { name: "Open src/a.ts on GitHub" })[0]!;
    expect(file).toHaveAttribute("href", `https://github.com/acme/app/blob/${SHA}/src/a.ts`);
    expect(file).toHaveAttribute("target", "_blank");
    expect(file).toHaveAttribute("rel", "noopener noreferrer");
    const dir = screen.getByRole("link", { name: "Open src/lib on GitHub" });
    expect(dir).toHaveAttribute("href", `https://github.com/acme/app/tree/${SHA}/src/lib`);
    expect(dir).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("copies the exact command with a toast and shows the review notice", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderSections(makeTour());

    expect(screen.getByText(/Review them before running anything/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy command: pnpm dev" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("pnpm dev"));
    expect(await screen.findByText("Command copied")).toBeInTheDocument();
  });

  it("shows the hotness note and a complexity text label", () => {
    renderSections(makeTour({ index: { ...makeTour().index, hotness_available: false } }));
    expect(screen.getByText(/Recent-change history isn't available/)).toBeInTheDocument();
    expect(screen.getByText("Low complexity")).toBeInTheDocument();
    expect(screen.getByText("High complexity")).toBeInTheDocument();
  });

  it("renders a skeleton tour with computed reasons only and no task cards", () => {
    renderSections(
      makeTour({
        mode: "skeleton",
        skeleton_reason: "llm_unavailable",
        architecture: { summary_md: null, diagram: null, stack: [{ name: "Fastify", evidence_path: "server/package.json" }], structure: [], routes: [] },
        critical_paths: [{ path: "server/src/app.ts", reason: null, computed_reason: "imported by 9 files · rank p99" }],
        run_locally: [],
        first_tasks: [],
      }),
    );
    expect(screen.getByText("imported by 9 files · rank p99")).toBeInTheDocument();
    expect(screen.getByText(/First tasks need the LLM step/)).toBeInTheDocument();
    expect(screen.queryByText("Fix a thing")).toBeNull();
    expect(screen.getByText("No run instructions found in the repo's files")).toBeInTheDocument();
    const first = document.getElementById("first-tasks")!;
    expect(within(first).queryAllByRole("listitem")).toHaveLength(0);
  });
});
