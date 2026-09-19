import type { Metadata } from "next";
import { AddRepoView } from "./_components/AddRepoView";

export const metadata: Metadata = { title: "Add repository" };

/* Route: /onboarding (Add repository). Thin route entry — the screen lives in _components/AddRepoView. */
export default function AddRepoPage() {
  return <AddRepoView />;
}
