import React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MultiAgentView } from "./_components/MultiAgentView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("multiAgent");
  return { title: t("page.crumb") };
}

/* Route: /repos/:repoId/multi-agent. Thin route entry — the view lives in _components/MultiAgentView.
   Suspense because the view reads `useSearchParams` (`?run=`). */
export default function MultiAgentPage() {
  return (
    <React.Suspense fallback={null}>
      <MultiAgentView />
    </React.Suspense>
  );
}
