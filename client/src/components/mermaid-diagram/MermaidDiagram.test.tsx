import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MermaidDiagram } from "./MermaidDiagram";

afterEach(cleanup);

describe("MermaidDiagram", () => {
  it("shows the fallback for input that is not a diagram, and nothing without one", async () => {
    const { container, rerender } = render(
      <MermaidDiagram chart="not a diagram" fallback={<p>no diagram</p>} />,
    );
    expect(await screen.findByText("no diagram")).toBeInTheDocument();

    rerender(<MermaidDiagram chart="not a diagram" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
