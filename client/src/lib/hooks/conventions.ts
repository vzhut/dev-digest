/* hooks/conventions.ts — React Query hooks for the Conventions Extractor (L02 homework). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionsResponse, ConventionStatus } from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionsResponse>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionsResponse>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => qc.setQueryData(["conventions", repoId], data),
  });
}

export interface UpdateConventionInput {
  id: string;
  status?: ConventionStatus;
  rule?: string;
}

/** Optimistic: the card reflects the new status/rule immediately, then
 * reconciles with the server response (or rolls back on error). */
export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  const key = ["conventions", repoId];
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateConventionInput) =>
      api.patch<ConventionCandidate>(`/repos/${repoId}/conventions/${id}`, patch),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ConventionsResponse>(key);
      if (previous) {
        // `edited` is left as-is here (the server computes it from ruleOriginal)
        // and corrected a moment later in onSuccess once the real response lands.
        qc.setQueryData<ConventionsResponse>(key, {
          ...previous,
          candidates: previous.candidates.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (updated) => {
      const current = qc.getQueryData<ConventionsResponse>(key);
      if (current) {
        qc.setQueryData<ConventionsResponse>(key, {
          ...current,
          candidates: current.candidates.map((c) => (c.id === updated.id ? updated : c)),
        });
      }
    },
  });
}
