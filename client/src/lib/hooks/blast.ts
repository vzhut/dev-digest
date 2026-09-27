/* hooks/blast.ts — React Query hooks for the blast-radius map (T5) and the
   Prior PRs history (T13).
   GET /pulls/:id/blast → BlastRadius, read from the repo-intel index once
   (no re-parse, no LLM). See server/src/modules/blast/service.ts.
   The repo-intel resync affordance (T11) lives in `hooks/repo-intel.ts`
   (`useResyncRepoIntel`) — that's the pre-existing, central home for
   repo-intel resync/status concerns. */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { BlastRadius, PrHistory } from "@devdigest/shared";
import { api } from "../api";

/** GET /pulls/:id/blast → the changed-symbol → downstream-caller map for this PR. */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

/**
 * GET /pulls/:id/history → merged prior PRs that touched the same files
 * (Design "Prior PRs", T13's `PrHistoryService`). The server TTL-caches this
 * for 15 minutes per repo+headSha (`HISTORY_CACHE_TTL_MS`,
 * `server/src/modules/blast/constants.ts`); the client staleTime here is
 * intentionally shorter (10 minutes) so a still-fresh cache entry never
 * looks stale to the user before the server itself would recompute it.
 */
export function usePrHistory(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-history", prId],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/history`),
    enabled: !!prId,
    staleTime: 10 * 60 * 1000,
  });
}
