"use client";

import { Icon, type IconName } from "@devdigest/ui";
import { rb } from "./rowButtonStyles";

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
      style={{ ...rb.base, ...(disabled ? rb.disabled : rb.enabled) }}
    >
      <I size={16} />
    </button>
  );
}
