import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettingsView } from "./_components/SettingsView";

/* Route: /settings/:section. Thin route entry — the view, its section panels,
   styles, constants and i18n are colocated under _components/SettingsView. */
export default function SettingsPage() {
  return <SettingsView />;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}
