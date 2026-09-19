/* FindingsPanel — severity pills + hide-low-confidence + j/k navigation +
   FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "@/lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { filterBySeverity, visibleFindings } from "./helpers";
import { severityCounts } from "@/lib/severity";
import { SeverityPills } from "./_components/SeverityPills";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);
  const [severity, setSeverity] = React.useState<Severity | null>(null);

  // Counts come from what the confidence toggle leaves visible, BEFORE the
  // severity filter — so a pill's number always equals the cards it reveals,
  // and picking one pill doesn't zero out the others.
  const confident = React.useMemo(() => visibleFindings(findings, hideLow), [findings, hideLow]);
  const counts = React.useMemo(() => severityCounts(confident), [confident]);

  // Guard for renders where the chosen severity has no findings left (e.g. the
  // findings prop changed): show the full list rather than an empty one.
  const activeSeverity = severity && counts.some((c) => c.severity === severity) ? severity : null;

  const shown = React.useMemo(
    () => filterBySeverity(confident, activeSeverity),
    [confident, activeSeverity],
  );

  // Every change to the visible list puts j/k focus back on the first card, so
  // the focused index can never point past the end of a shorter list.
  const toggleSeverity = (next: Severity) => {
    setSeverity((cur) => (cur === next ? null : next));
    setFocusIdx(0);
  };
  const toggleHideLow = (next: boolean) => {
    setHideLow(next);
    setFocusIdx(0);
    // Hiding low-confidence findings removed every finding of the active
    // severity → clear the filter (not just mask it), so turning the toggle
    // back off doesn't silently re-apply a filter whose pill had vanished.
    if (severity && !severityCounts(visibleFindings(findings, next)).some((c) => c.severity === severity)) {
      setSeverity(null);
    }
  };

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        <SeverityPills counts={counts} active={activeSeverity} onToggle={toggleSeverity} />
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={toggleHideLow} size={16} />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
      ) : (
        // Named list ("2 findings shown") so the visible count is exposed to
        // assistive tech — and to role-based e2e locators.
        <div role="list" aria-label={t("panel.shownCount", { count: shown.length })} style={s.list}>
          {shown.map((f, i) => (
            <div role="listitem" key={f.id}>
              <FindingCard
                f={f}
                focused={i === focusIdx}
                defaultExpanded={i === 0}
                pending={action.isPending}
                repoFullName={repoFullName}
                headSha={headSha}
                onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
