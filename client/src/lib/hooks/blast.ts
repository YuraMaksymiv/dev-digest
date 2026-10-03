/* hooks/blast.ts — React Query hook for a PR's blast radius.
     GET /pulls/:id/blast → BlastRadius (degradation arrives as data: `degraded` + `reason`). */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { BlastRadius } from "@devdigest/shared";
import { api } from "../api";

export const blastRadiusKey = (prId: string | null | undefined) => ["pr-blast", prId] as const;

export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: blastRadiusKey(prId),
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
