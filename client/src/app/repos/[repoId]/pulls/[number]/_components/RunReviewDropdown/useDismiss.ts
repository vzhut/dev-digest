"use client";

import React from "react";

/** Closes an open popover on an outside mousedown or Escape. */
export function useDismiss(
  open: boolean,
  rootRef: React.RefObject<HTMLElement | null>,
  onDismiss: () => void,
): void {
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, rootRef, onDismiss]);
}
