import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AgentEditorView } from "./_components/AgentEditorView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agents");
  return { title: t("list.breadcrumb") };
}

/* Route: /agents/:id (Agent editor). Thin route entry — the view lives in _components/AgentEditorView. */
export default function AgentEditorPage() {
  return <AgentEditorView />;
}
