/* Route error boundary — catches render-time crashes in any page below the root
   layout and shows the app's ErrorState instead of Next's default screen.
   Data-loading errors are still handled inside each View (ErrorState + refetch). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return <ErrorState fullScreen title={t("routeError.title")} body={t("routeError.body")} onRetry={reset} />;
}
