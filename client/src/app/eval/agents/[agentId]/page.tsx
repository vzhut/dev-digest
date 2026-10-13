import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EvalAgentDetailView } from "./_components/EvalAgentDetailView";

/* Route: /eval/agents/:agentId — one agent's eval metrics, run history and Compare. Thin route entry. */
export default function EvalAgentPage() {
  return <EvalAgentDetailView />;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("eval");
  return { title: t("board.title") };
}
