/* hooks/ci.ts — React Query hooks for Export to CI: the wizard (preview / install / zip), the
   per-agent installations list and the workspace-wide CI runs (pulled from GitHub on every fetch). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CiExportRequest } from "@devdigest/shared";
import { api } from "../api";

/** Refetch cadence of the CI Runs list; each fetch also asks the server to pull new runs. */
export const CI_RUNS_REFETCH_MS = 60_000;

export function useCiPreview(agentId: string) {
  return useMutation({ mutationFn: (body: CiExportRequest) => api.ciPreview(agentId, body) });
}

export function useCiInstall(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CiExportRequest) => api.ciInstall(agentId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ci", "installations", agentId] }),
  });
}

/**
 * The zip path upserts a `pending` installation too, hence the same invalidation.
 * `onBlob` runs from the mutation itself (not a per-call callback), so a download still
 * happens when the wizard is closed while the request is in flight.
 */
export function useCiZip(agentId: string, onBlob?: (blob: Blob) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CiExportRequest) => api.ciZip(agentId, body),
    onSuccess: (blob) => {
      onBlob?.(blob);
      return qc.invalidateQueries({ queryKey: ["ci", "installations", agentId] });
    },
  });
}

export function useCiInstallations(agentId: string) {
  return useQuery({
    queryKey: ["ci", "installations", agentId],
    queryFn: () => api.ciInstallations(agentId),
  });
}

export function useCiRuns() {
  return useQuery({
    queryKey: ["ci", "runs"],
    queryFn: () => api.ciSyncRuns(),
    refetchInterval: CI_RUNS_REFETCH_MS,
    refetchIntervalInBackground: false,
  });
}
