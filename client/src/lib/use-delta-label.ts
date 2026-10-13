"use client";

import { useTranslations } from "next-intl";
import { deltaParts } from "./eval-format";

/** Word a metric change ("▲ +6 pts") through i18n; the direction is in the arrow and the sign, not in colour. */
export function useDeltaLabel(): (delta: number | null | undefined) => string {
  const t = useTranslations("eval.delta");
  return (delta) => {
    const { direction, points } = deltaParts(delta);
    return direction === "unknown" || points === null ? t("unknown") : t(direction, { points });
  };
}
