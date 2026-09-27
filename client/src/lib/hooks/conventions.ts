/* hooks/conventions.ts — React Query hooks for the Conventions extractor.
   A candidate is a house rule the scan proposed and code verified against the
   cloned file; the user accepts, rejects or edits it, and the accepted set is
   merged into a skill draft. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionSkillDraft,
  ConventionStatus,
} from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * A scan is a MUTATION, not a query: it costs a model call, so it must never
 * fire on mount, on focus or on a retry. Its response already contains the
 * full candidate list, so it seeds the list cache instead of forcing a refetch.
 */
export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data, repoId) => {
      qc.setQueryData(["conventions", repoId], data.candidates);
    },
  });
}

export interface PatchConventionInput {
  repoId: string;
  id: string;
  patch: { rule?: string; rationale?: string; status?: ConventionStatus };
}

export function usePatchConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: PatchConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (_d, { repoId }) => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

export function useDeleteConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { repoId: string; id: string }) =>
      api.del<{ ok: boolean }>(`/conventions/${id}`),
    onSuccess: (_d, { repoId }) => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

/**
 * Build the skill draft from the accepted set. A mutation although it writes
 * nothing: it is a POST taken on a click, and caching a "draft" would hand the
 * user a stale body after they accept one more rule.
 */
export function useConventionSkillDraft() {
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill`),
  });
}
