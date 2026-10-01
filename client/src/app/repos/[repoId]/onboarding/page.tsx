import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OnboardingTourView } from "./_components/OnboardingTourView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("page.title") };
}

/* Route: /repos/:repoId/onboarding. Thin route entry — the view lives in _components/OnboardingTourView. */
export default function OnboardingTourPage() {
  return <OnboardingTourView />;
}
