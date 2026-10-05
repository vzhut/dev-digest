import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

export const SEVERITY_META: Record<RiskSeverity, { color: string; bg: string; icon: IconName }> = {
  high: { color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)", icon: "AlertTriangle" },
  low: { color: "var(--info)", bg: "var(--info-bg)", icon: "Info" },
};
