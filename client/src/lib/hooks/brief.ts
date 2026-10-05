/* hooks/brief.ts — React Query hooks for the PR brief (Why + Risk brief).
   Reading never generates: the GET only returns what is stored (or a status).
   Generating is an explicit mutation (one LLM call). While another request is
   generating, the query polls so a second tab picks up the result. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { PrBriefResponse } from "@devdigest/shared";

const POLL_MS = 2000;

export const briefKeys = {
  brief: (prId: string | null | undefined) => ["pr-brief", prId] as const,
};

export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefKeys.brief(prId),
    queryFn: () => api.getPrBrief(prId as string),
    enabled: !!prId,
    refetchInterval: (query) => (query.state.data?.status === "generating" ? POLL_MS : false),
  });
}

/** The POST answers with the stored brief (or the full read response); both land
    in the cache as a fresh `ready` response, then the GET is refetched. A 409
    `generation_in_progress` refetches so polling picks up the other request's
    result; the error is still surfaced to the caller. */
export function useGeneratePrBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  const key = briefKeys.brief(prId);
  return useMutation({
    mutationFn: () => api.generatePrBrief(prId as string),
    onSuccess: (result) => {
      const brief = "status" in result ? result.brief : result;
      if (brief) qc.setQueryData<PrBriefResponse>(key, { status: "ready", stale: false, brief });
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409 && error.code === "generation_in_progress") {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
