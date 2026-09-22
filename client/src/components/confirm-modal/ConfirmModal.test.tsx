import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { ConfirmModal } from "./ConfirmModal";

afterEach(cleanup);

const setup = (over: Partial<React.ComponentProps<typeof ConfirmModal>> = {}) => {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <ConfirmModal title="Delete skill" body="Agents will lose it." confirmLabel="Delete" onConfirm={onConfirm} onClose={onClose} {...over} />
    </NextIntlClientProvider>,
  );
  return { onConfirm, onClose };
};

describe("ConfirmModal", () => {
  it("renders title and body in a dialog", () => {
    setup();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete skill")).toBeInTheDocument();
    expect(screen.getByText("Agents will lose it.")).toBeInTheDocument();
  });

  it("confirm calls onConfirm only", () => {
    const { onConfirm, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancel and ✕ call onClose and never onConfirm", () => {
    const { onConfirm, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("while pending both buttons are disabled and ✕ is gone", () => {
    setup({ pending: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Delete/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});
