/* hooks/eval.ts — React Query hooks over the eval endpoints (cases, suite runs, compare,
   dashboards). The list of an agent's runs polls every 2 s while any run is `running`, so the
   Evals tab and the per-agent view show live "k / n cases" progress and survive a reload. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { EvalSuiteRun } from "@devdigest/shared";

export const EVAL_POLL_MS = 2000;

export const evalKeys = {
  links: (prId: string | null | undefined) => ["eval-case-links", prId] as const,
  cases: (agentId: string | null | undefined) => ["eval-cases", agentId] as const,
  case: (caseId: string | null | undefined) => ["eval-case", caseId] as const,
  runs: (agentId: string | null | undefined) => ["eval-runs", agentId] as const,
  run: (runId: string | null | undefined) => ["eval-run", runId] as const,
  compare: (a: string | null | undefined, b: string | null | undefined) => ["eval-compare", a, b] as const,
  dashboard: ["eval-dashboard"] as const,
  agentDashboard: (agentId: string | null | undefined) => ["eval-agent-dashboard", agentId] as const,
};

/** Poll while any run is still running; stop as soon as none is. */
export function evalRunsRefetchInterval(runs: EvalSuiteRun[] | undefined): number | false {
  return runs?.some((r) => r.status === "running") ? EVAL_POLL_MS : false;
}

/** Finding → case (one click). `prId` refreshes the FindingCard tags of that PR. */
export function useCreateEvalCase(prId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => api.createEvalCase(findingId),
    onSuccess: (res) => {
      if (prId) qc.invalidateQueries({ queryKey: evalKeys.links(prId) });
      qc.invalidateQueries({ queryKey: evalKeys.cases(res.case.agent_id) });
      qc.invalidateQueries({ queryKey: evalKeys.dashboard });
    },
  });
}

export function useEvalCaseLinks(prId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.links(prId),
    queryFn: () => api.getEvalCaseLinks(prId as string),
    enabled: !!prId,
  });
}

export function useAgentEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.cases(agentId),
    queryFn: () => api.listAgentEvalCases(agentId as string),
    enabled: !!agentId,
  });
}

export function useEvalCase(caseId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.case(caseId),
    queryFn: () => api.getEvalCase(caseId as string),
    enabled: !!caseId,
  });
}

export function useDeleteEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.deleteEvalCase(caseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: evalKeys.cases(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.dashboard });
    },
  });
}

/** Paid. The 202 only means "started": the runs list then polls for progress. */
export function useStartEvalRun(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: evalKeys.runs(agentId) });
    qc.invalidateQueries({ queryKey: evalKeys.agentDashboard(agentId) });
    qc.invalidateQueries({ queryKey: evalKeys.dashboard });
  };
  return useMutation({
    mutationFn: () => api.startEvalRun(agentId as string),
    onSuccess: refresh,
    // a 409 (already running) still needs the list refreshed so the progress shows
    onError: refresh,
  });
}

export function useAgentEvalRuns(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.runs(agentId),
    queryFn: () => api.listAgentEvalRuns(agentId as string),
    enabled: !!agentId,
    refetchInterval: (query) => evalRunsRefetchInterval(query.state.data),
  });
}

export function useEvalRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.run(runId),
    queryFn: () => api.getEvalRun(runId as string),
    enabled: !!runId,
  });
}

export function useEvalCompare(a: string | null | undefined, b: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.compare(a, b),
    queryFn: () => api.compareEvalRuns(a as string, b as string),
    enabled: !!a && !!b,
  });
}

export function useEvalDashboard() {
  return useQuery({
    queryKey: evalKeys.dashboard,
    queryFn: () => api.getEvalDashboard(),
    // keep cards current while any run is still going
    refetchInterval: (query) =>
      query.state.data?.recent_runs.some((r) => r.status === "running") ? EVAL_POLL_MS : false,
  });
}

export function useAgentEvalDashboard(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.agentDashboard(agentId),
    queryFn: () => api.getAgentEvalDashboard(agentId as string),
    enabled: !!agentId,
    refetchInterval: (query) =>
      query.state.data?.runs.some((r) => r.status === "running") ? EVAL_POLL_MS : false,
  });
}

export function useRunAllEvals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.runAllEvals(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: evalKeys.dashboard });
      qc.invalidateQueries({ queryKey: ["eval-runs"] });
    },
  });
}
