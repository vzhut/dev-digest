"use client";

import { Icon, type IconName } from "@devdigest/ui";

const BASE = {
  width: 30,
  height: 30,
  display: "inline-grid",
  placeItems: "center",
  borderRadius: 6,
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--text-secondary)",
} as const;

/** An icon button that can be disabled (the vendored IconBtn cannot): the per-row run button. */
export function RowButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const I = Icon[icon];
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{ ...BASE, ...(disabled ? { opacity: 0.4, cursor: "not-allowed" } : { cursor: "pointer" }) }}
    >
      <I size={16} />
    </button>
  );
}
