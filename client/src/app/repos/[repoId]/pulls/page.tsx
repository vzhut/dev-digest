import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PullsView } from "./_components/PullsView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("prReview");
  return { title: t("list.title") };
}

/* Route: /repos/:repoId/pulls (PR list). Thin route entry — the view lives in _components/PullsView. */
export default function PullsPage() {
  return <PullsView />;
}
