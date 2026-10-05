"use client";

import { useTranslations } from "next-intl";
import { Button, EmptyState } from "@devdigest/ui";

/** "No tour yet" / "not cloned yet" with the Generate action; never generates by itself (AC-4, AC-6). */
export function TourEmpty({
  notCloned,
  generating,
  onGenerate,
}: {
  notCloned: boolean;
  generating: boolean;
  onGenerate: () => void;
}) {
  const t = useTranslations("onboarding.page");
  const key = notCloned ? "notCloned" : "none";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <EmptyState icon="Workflow" title={t(`${key}.title`)} body={t(`${key}.body`)} />
      <Button
        kind="primary"
        icon="Sparkles"
        loading={generating}
        disabled={notCloned || generating}
        title={t("actions.callTooltip")}
        onClick={onGenerate}
      >
        {t("actions.generate")}
      </Button>
    </div>
  );
}
