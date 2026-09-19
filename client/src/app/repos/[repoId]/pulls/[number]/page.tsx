import type { Metadata } from "next";
import { PrDetailView } from "./_components/PrDetailView";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const { number } = await params;
  return { title: `PR #${number}` };
}

/* Route: /repos/:repoId/pulls/:number (PR detail). Thin route entry — the view,
   its tabs and the run-trace drawer live under _components/PrDetailView. */
export default function PRDetailPage() {
  return <PrDetailView />;
}
