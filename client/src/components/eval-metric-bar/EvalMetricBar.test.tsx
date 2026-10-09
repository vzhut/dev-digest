import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EvalMetricBar } from "./EvalMetricBar";

afterEach(cleanup);

describe("EvalMetricBar", () => {
  it("shows the percentage next to the bar, and a dash for an unknown metric", () => {
    const view = render(<EvalMetricBar value={0.82} color="var(--accent)" />);
    expect(screen.getByText("82%")).toBeInTheDocument();
    view.unmount();
    render(<EvalMetricBar value={null} color="var(--accent)" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
