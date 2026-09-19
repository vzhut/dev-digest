/* Not-found view — the app's empty state for an unknown URL. Client component:
   @devdigest/ui re-exports recharts class components, which can't be evaluated
   in a Server Component (dev server: "Super expression must either be null or a function"). */
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function NotFoundView() {
  const t = useTranslations("common");
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
