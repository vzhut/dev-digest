import type { DisplayStatus } from "../../helpers";

export const STATUS_COLOR: Record<DisplayStatus, string> = {
  queued: "var(--text-muted)",
  running: "var(--accent)",
  done: "var(--ok)",
  failed: "var(--crit)",
  cancelled: "var(--text-muted)",
};
