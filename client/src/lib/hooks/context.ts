/* hooks/context.ts — React Query hooks for Project Context: the repo's doc
   listing, a single doc, search roots, and the paths attached to an agent / skill.
   Saves never touch agent/skill versions; they invalidate their own key plus the
   listing (used_by_agents changes). The listing is scanned fresh per request, so
   "refresh" is just `refetch`. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ContextListing,
  ContextDocContent,
  ContextDocWritten,
  AgentContext,
  SkillContext,
} from "@devdigest/shared";

export const contextKeys = {
  all: ["context"] as const,
  list: (repoId: string | null | undefined) => ["context", repoId] as const,
  doc: (repoId: string | null | undefined, path: string | null | undefined) =>
    ["context", repoId, "doc", path] as const,
  roots: (repoId: string | null | undefined) => ["context", repoId, "roots"] as const,
  agent: (agentId: string | null | undefined) => ["agent-context", agentId] as const,
  skill: (skillId: string | null | undefined) => ["skill-context", skillId] as const,
};

export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: contextKeys.list(repoId),
    queryFn: () => api.get<ContextListing>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useContextDoc(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: contextKeys.doc(repoId, path),
    queryFn: () =>
      api.get<ContextDocContent>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path,
  });
}

export function useContextRoots(repoId: string | null | undefined) {
  return useQuery({
    queryKey: contextKeys.roots(repoId),
    queryFn: () => api.get<{ roots: string[] }>(`/repos/${repoId}/context/roots`),
    enabled: !!repoId,
  });
}

/** Writes one doc into the repo's local clone. Invalidates the listing, doc and roots keys (shared ["context", repoId] prefix). */
export function useWriteContextFile(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { path: string; content: string }) =>
      api.put<ContextDocWritten>(`/repos/${repoId}/context/file`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: contextKeys.list(repoId) }),
  });
}

/** `[]` resets to the default glob server-side. A 422 surfaces as an ApiError. */
export function useSaveContextRoots(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roots: string[]) => api.put<{ roots: string[] }>(`/repos/${repoId}/context/roots`, { roots }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contextKeys.roots(repoId) });
      qc.invalidateQueries({ queryKey: contextKeys.all });
    },
  });
}

export function useAgentContext(agentId: string | null | undefined) {
  return useQuery({
    queryKey: contextKeys.agent(agentId),
    queryFn: () => api.get<AgentContext>(`/agents/${agentId}/context`),
    enabled: !!agentId,
  });
}

export function useSaveAgentContext(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => api.put<AgentContext>(`/agents/${agentId}/context`, { paths }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contextKeys.agent(agentId) });
      qc.invalidateQueries({ queryKey: contextKeys.all });
    },
  });
}

export function useSkillContext(skillId: string | null | undefined) {
  return useQuery({
    queryKey: contextKeys.skill(skillId),
    queryFn: () => api.get<SkillContext>(`/skills/${skillId}/context`),
    enabled: !!skillId,
  });
}

export function useSaveSkillContext(skillId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => api.put<SkillContext>(`/skills/${skillId}/context`, { paths }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contextKeys.skill(skillId) });
      qc.invalidateQueries({ queryKey: contextKeys.all });
    },
  });
}
