import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useDialogKeys } from "./use-dialog-keys";

afterEach(cleanup);

function Dialog({ onClose, enabled = true }: { onClose: () => void; enabled?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  useDialogKeys(ref, onClose, enabled);
  return (
    <div role="dialog">
      <div ref={ref}>
        <button>one</button>
        <button>two</button>
        <button>three</button>
      </div>
    </div>
  );
}

function mount(props: { onClose: () => void; enabled?: boolean }) {
  const opener = document.createElement("button");
  opener.textContent = "opener";
  document.body.appendChild(opener);
  opener.focus();
  const view = render(<Dialog {...props} />);
  return { opener, view };
}

describe("useDialogKeys", () => {
  it("moves focus into the dialog on open and gives it back to the opener when the dialog goes away", () => {
    const { opener, view } = mount({ onClose: vi.fn() });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "one" }));
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("Escape closes; with enabled=false it does nothing", () => {
    const onClose = vi.fn();
    const { view, opener } = mount({ onClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.rerender(<Dialog onClose={onClose} enabled={false} />);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(document, { key: "Tab" });
    expect(onClose).toHaveBeenCalledTimes(1);
    opener.remove();
  });

  it("Tab from the last control wraps to the first; Shift+Tab from the first wraps to the last; middle moves are left alone", () => {
    const { opener } = mount({ onClose: vi.fn() });
    const [one, two, three] = ["one", "two", "three"].map((n) => screen.getByRole("button", { name: n }));
    three!.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(one);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(three);
    two!.focus();
    const middle = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    document.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(false); // the browser handles a Tab between the ends
    opener.remove();
  });

  it("pulls focus back in when it has escaped the dialog", () => {
    const { opener } = mount({ onClose: vi.fn() });
    opener.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "one" }));
    opener.remove();
  });

  it("pausing (enabled=false) does not throw focus back behind the dialog; only unmounting does", () => {
    const { opener, view } = mount({ onClose: vi.fn() });
    screen.getByRole("button", { name: "two" }).focus();
    view.rerender(<Dialog onClose={vi.fn()} enabled={false} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "two" }));
    expect(document.activeElement).not.toBe(opener);
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
