/* hooks/repo-intel.ts — React Query hooks for the repo-intel (T3) index state
   and its resync affordance (T11: polling + completion detection).
   Mirrors hooks/context.ts (useIndexStatus/useReindex) but targets the
   repo-intel facade's HTTP surface:
     GET  /repos/:id/index-state  → RepoIntelState
     POST /repos/:id/resync       → fetch latest from origin + incremental
                                     reindex (202). NOT a destructive re-clone. */
"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api";

/** Subset of the server's IndexState the badge + completion-poll need (kept
    local — not in @devdigest/shared, since repo-intel types live server-side). */
export interface RepoIntelState {
  status: "full" | "partial" | "degraded" | "failed";
  filesIndexed: number;
  filesSkipped: number;
  /** Advances when a resync writes a new index row → the UI's completion signal. */
  lastIndexedSha: string;
  updatedAt: string;
  degraded?: boolean;
  degradedReason?: string;
  reason?: string;
}

/** GET /repos/:id/index-state → current repo-intel index state.
    While `poll` is true, refetch on an interval so a running resync's result
    becomes visible. The caller (ProjectContextView) owns when to stop polling
    (the status enum is terminal-only, so completion is detected by watching
    `lastIndexedSha`/`updatedAt` advance, not by status). */
export function useRepoIntelStatus(repoId: string | null | undefined, poll = false) {
  return useQuery({
    queryKey: ["repo-intel-state", repoId],
    queryFn: () => api.get<RepoIntelState>(`/repos/${repoId}/index-state`),
    enabled: !!repoId,
    refetchInterval: poll ? 1500 : false,
  });
}

/** POST /repos/:id/resync's response — mirrors repo-intel/routes.ts:60-63. */
interface ResyncResponse {
  status: string;
  jobId?: string;
  degraded?: boolean;
  reason?: string;
}

export type ResyncPhase = "idle" | "pending" | "queued" | "failed";

/**
 * Kick off a repo-intel resync for `repoId`, then poll `useRepoIntelStatus`
 * until the index advances, and call `onIndexed` once so the caller can
 * refetch its own query — no query keys are hardcoded here, the caller owns
 * that (e.g. `BlastRadiusCard` passes `useBlastRadius`'s `refetch`).
 *
 * `/resync` answers 202 even when the enqueue itself failed
 * (`degraded:true, reason:'no_handler'`, `repo-intel/routes.ts:44-63`) — that
 * maps straight to the "failed" phase, without ever polling.
 */
export function useResyncRepoIntel(repoId: string | null | undefined, onIndexed?: () => void) {
  const [phase, setPhase] = useState<ResyncPhase>("idle");
  const baseline = useRef<{ sha: string; updatedAt: string } | null>(null);
  const onIndexedRef = useRef(onIndexed);
  onIndexedRef.current = onIndexed;

  // Poll only while a resync we started is in flight; useQuery clears the
  // interval itself once `poll` flips back to false, or on unmount.
  const status = useRepoIntelStatus(repoId, phase === "queued");

  // The first poll response after a resync becomes the baseline (it may
  // still be the pre-resync state — a stale cache read at mutate-time would
  // race the very first poll tick and could look "changed" immediately).
  // Only a *later* tick that differs from that baseline counts as "advanced".
  useEffect(() => {
    if (phase !== "queued" || !status.data) return;
    const { lastIndexedSha, updatedAt } = status.data;
    if (!baseline.current) {
      baseline.current = { sha: lastIndexedSha, updatedAt };
      return;
    }
    if (lastIndexedSha !== baseline.current.sha || updatedAt !== baseline.current.updatedAt) {
      setPhase("idle");
      baseline.current = null;
      onIndexedRef.current?.();
    }
  }, [phase, status.data]);

  const mutation = useMutation({
    mutationFn: () => api.post<ResyncResponse>(`/repos/${repoId}/resync`),
    onMutate: () => {
      baseline.current = null;
      setPhase("pending");
    },
    onSuccess: (res) => {
      setPhase(res.degraded ? "failed" : "queued");
    },
    onError: () => {
      setPhase("failed");
    },
  });

  return { resync: () => mutation.mutate(), phase, isResyncing: mutation.isPending };
}
