import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DownstreamImpact } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/blast.json";

vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => <pre data-testid="mermaid-diagram">{chart}</pre>,
}));

import { BlastGraph } from "./BlastGraph";

const DOWNSTREAM: DownstreamImpact[] = [
  {
    symbol: "runReview",
    file: "server/src/modules/reviews/service.ts",
    callers: [{ name: "handler", file: "server/src/modules/pulls/routes.ts", line: 42 }],
    callers_total: 1,
    endpoints_affected: ["GET /pulls/:id"],
    crons_affected: [],
  },
];

function renderGraph(downstream: DownstreamImpact[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastGraph downstream={downstream} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("BlastGraph", () => {
  it("renders the mocked diagram with the generated chart when there is downstream impact", () => {
    renderGraph(DOWNSTREAM);

    const region = screen.getByLabelText(messages.graph.ariaLabel);
    expect(region).toBeInTheDocument();
    const diagram = screen.getByTestId("mermaid-diagram");
    expect(diagram.textContent).toContain("flowchart LR");
    expect(diagram.textContent).toContain("runReview");
    expect(diagram.textContent).toContain("server/src/modules/pulls/routes.ts:42");
  });

  it("shows the empty text and no diagram when there is no downstream impact", () => {
    renderGraph([]);

    expect(screen.getByText(messages.graph.empty)).toBeInTheDocument();
    expect(screen.queryByTestId("mermaid-diagram")).not.toBeInTheDocument();
  });
});
