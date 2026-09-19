import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AddRepoView } from "./_components/AddRepoView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("repos");
  return { title: t("add.metaTitle") };
}

/* Route: /onboarding (Add repository). Thin route entry — the screen lives in _components/AddRepoView. */
export default function AddRepoPage() {
  return <AddRepoView />;
}
