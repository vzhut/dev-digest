import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConventionsView } from "./_components/ConventionsView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("conventions");
  return { title: t("page.crumbConventions") };
}

/* Route: /repos/:repoId/conventions. Thin route entry — the view lives in _components/ConventionsView. */
export default function ConventionsPage() {
  return <ConventionsView />;
}
