import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SkillEditorView } from "./_components/SkillEditorView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("skills");
  return { title: t("page.crumbSkills") };
}

/* Route: /skills/:id (Skill editor deep link). Thin route entry. */
export default function SkillEditorPage() {
  return <SkillEditorView />;
}
