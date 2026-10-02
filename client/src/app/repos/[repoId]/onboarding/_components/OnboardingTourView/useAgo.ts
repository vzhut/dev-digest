"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { relativeTime } from "@/lib/relative-time";

const AGO_TICK_MS = 60_000;

/** "2h ago" / "just now" for an ISO time; "—" when unparseable. */
export function useAgo(): (iso: string) => string {
  const t = useTranslations("onboarding.page.time");
  // Coarse tick so an open tab does not keep showing a stale "3m ago".
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), AGO_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return (iso) => {
    const rel = relativeTime(iso);
    if (rel === "now") return t("justNow");
    if (rel === "—") return rel;
    return t("ago", { ago: rel });
  };
}
