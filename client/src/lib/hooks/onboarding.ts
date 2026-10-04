/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour.
   Generation is a MUTATION, never a query: it can cost a model call, so it
   fires on a click and nowhere else. Its response is the full page payload, so
   it seeds the query cache instead of forcing a refetch. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingResponse } from "@devdigest/shared";

export function useOnboarding(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["onboarding", repoId],
    queryFn: () => api.get<OnboardingResponse>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchOnWindowFocus: false,
  });
}

export function useGenerateOnboarding(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingResponse>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: (data) => {
      qc.setQueryData(["onboarding", repoId], data);
    },
  });
}
