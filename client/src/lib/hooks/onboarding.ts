/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour of a repo.
   Reading never generates: the GET only returns what is stored (or a status).
   Generating is an explicit mutation (one LLM call). While another request is
   generating, the query polls so a second tab picks up the result. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { OnboardingTourResponse } from "@devdigest/shared";

const POLL_MS = 2000;

export const onboardingKeys = {
  tour: (repoId: string | null | undefined) => ["onboarding-tour", repoId] as const,
};

export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: onboardingKeys.tour(repoId),
    queryFn: () => api.getOnboardingTour(repoId as string),
    enabled: !!repoId,
    refetchInterval: (query) => (query.state.data?.status === "generating" ? POLL_MS : false),
  });
}

/** Success writes the stored tour straight into the cache (keeping the previous
    `index_sha`) and refetches. A 409 `generation_in_progress` refetches so the
    polling picks up the other request's result; the error is still surfaced. */
export function useGenerateOnboardingTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  const key = onboardingKeys.tour(repoId);
  return useMutation({
    mutationFn: () => api.generateOnboardingTour(repoId as string),
    onSuccess: (tour) => {
      const previous = qc.getQueryData<OnboardingTourResponse>(key);
      qc.setQueryData<OnboardingTourResponse>(key, {
        status: "ready",
        tour,
        index_sha: previous?.index_sha ?? null,
      });
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409 && error.code === "generation_in_progress") {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
