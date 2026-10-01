"use client";

import { useTranslations } from "next-intl";
import { relativeTime } from "@/lib/relative-time";

/** "2h ago" / "just now" for an ISO time; "—" when unparseable. */
export function useAgo(): (iso: string) => string {
  const t = useTranslations("onboarding.page.time");
  return (iso) => {
    const rel = relativeTime(iso);
    if (rel === "now") return t("justNow");
    if (rel === "—") return rel;
    return t("ago", { ago: rel });
  };
}
