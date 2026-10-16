import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs (CI Runs). Thin route entry — the view lives in _components/CiRunsView. */
export default function CiRunsPage() {
  return <CiRunsView />;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ci");
  return { title: t("runs.title") };
}
