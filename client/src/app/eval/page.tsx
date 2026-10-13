import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EvalDashboardView } from "./_components/EvalDashboardView";

/* Route: /eval (Eval Dashboard). Thin route entry — the view and its pieces live under _components. */
export default function EvalPage() {
  return <EvalDashboardView />;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("eval");
  return { title: t("board.title") };
}
