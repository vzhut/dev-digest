"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useGenerateOnboardingTour, useOnboardingTour } from "@/lib/hooks/onboarding";
import { isSectionId, shareUrl } from "./helpers";

/** Scrolls to a section, moves focus to its heading and records the fragment (AC-3). */
function goToSection(id: string) {
  document.getElementById(id)?.scrollIntoView?.({ block: "start" });
  document.getElementById(`${id}-heading`)?.focus({ preventScroll: true });
  window.history.replaceState(null, "", `#${id}`);
}

/** Data, generate/share actions and the post-load scroll for the tour page. */
export function useTourPage(repoId: string) {
  const t = useTranslations("onboarding.page.actions");
  const toast = useToast();
  const query = useOnboardingTour(repoId);
  const mutation = useGenerateOnboardingTour(repoId);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const data = query.data;
  const generating = mutation.isPending || data?.status === "generating";
  const hasTour = !!data?.tour;

  const generate = () =>
    mutation.mutate(undefined, { onError: (e) => toast.error(apiErrorMessage(e, t("generateFailed"))) });

  // navigator.clipboard is undefined outside secure contexts, so the call itself can throw.
  const share = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(window.location));
      toast.success(t("shareCopied"));
    } catch {
      toast.error(t("shareFailed"));
    }
  };

  const select = (id: string) => {
    setActiveId(id);
    goToSection(id);
  };

  // Once the cards exist, honour a `#section` fragment from a shared link.
  React.useEffect(() => {
    if (!hasTour) return;
    const id = window.location.hash.slice(1);
    if (!isSectionId(id)) return;
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView?.({ block: "start" });
  }, [hasTour]);

  return { query, data, generating, generate, share, select, activeId };
}
