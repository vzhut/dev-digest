import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (Skills Lab list). Thin route entry — the view lives in _components/SkillsListView. */
export default function SkillsPage() {
  return <SkillsListView />;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("skills");
  return { title: t("page.crumbSkills") };
}
