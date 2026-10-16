import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useDismiss } from "./useDismiss";

function Harness({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  useDismiss(open, ref, onDismiss);
  return (
    <div>
      <div ref={ref}>
        <button>inside</button>
      </div>
      <button>outside</button>
    </div>
  );
}

describe("useDismiss", () => {
  it("dismisses on an outside mousedown but not an inside one", () => {
    const onDismiss = vi.fn();
    render(<Harness open onDismiss={onDismiss} />);
    fireEvent.mouseDown(screen.getByText("inside"));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByText("outside"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape", () => {
    const onDismiss = vi.fn();
    render(<Harness open onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does nothing while closed", () => {
    const onDismiss = vi.fn();
    render(<Harness open={false} onDismiss={onDismiss} />);
    fireEvent.mouseDown(screen.getByText("outside"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
