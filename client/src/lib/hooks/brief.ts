/* hooks/brief.ts — React Query hooks for a PR's Why + Risk Brief.
   Generation is a MUTATION, never a query: it costs a model call, so it fires
   on a click and nowhere else. Its response is the full brief, so it seeds the
   query cache instead of forcing a refetch. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrBriefResponse } from "@devdigest/shared";
import { api } from "../api";

export const prBriefKey = (prId: string | null | undefined) => ["pr-brief", prId] as const;

/** `null` before a brief was ever generated — a normal state, not an error. */
export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: prBriefKey(prId),
    queryFn: () => api.get<PrBriefResponse | null>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    refetchOnWindowFocus: false,
  });
}

export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    onSuccess: (data) => {
      qc.setQueryData(prBriefKey(prId), data);
    },
  });
}
