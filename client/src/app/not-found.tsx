import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@devdigest/ui";

/* Unknown URL — the app's empty state instead of Next's bare 404 page. */
export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <EmptyState
      icon="Search"
      title={t("notFound.title")}
      body={
        <>
          {t("notFound.body")} <Link href="/">{t("notFound.home")}</Link>
        </>
      }
    />
  );
}
