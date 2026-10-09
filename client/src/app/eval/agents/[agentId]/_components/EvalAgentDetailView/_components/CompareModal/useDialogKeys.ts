import React from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour for a modal dialog: Escape closes, Tab / Shift+Tab cycle inside the dialog, and
 * focus moves into it on open (and back to the opener on close). `ref` marks an element INSIDE the
 * dialog; the nearest `[role=dialog]` ancestor is the trap boundary.
 */
export function useDialogKeys(ref: React.RefObject<HTMLElement | null>, onClose: () => void): void {
  const closeRef = React.useRef(onClose);
  // keep the latest handler without writing a ref during render
  React.useEffect(() => {
    closeRef.current = onClose;
  });

  React.useEffect(() => {
    const dialog = ref.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () => (dialog ? [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)] : []);
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [ref]);
}
