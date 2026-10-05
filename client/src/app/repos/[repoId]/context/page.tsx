import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProjectContextView } from "./_components/ProjectContextView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("context");
  return { title: t("page.title") };
}

/* Route: /repos/:repoId/context. Thin route entry — the view lives in _components/ProjectContextView. */
export default function ProjectContextPage() {
  return <ProjectContextView />;
}
