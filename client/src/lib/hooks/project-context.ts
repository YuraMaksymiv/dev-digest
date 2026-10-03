/* hooks/project-context.ts — React Query hooks for Project Context: the repo's
   markdown docs and the per-repo doc set attached to an agent or a skill. Query
   keys live under "project-context", distinct from the legacy ["context", id]. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ContextAttachmentList,
  ContextAttachmentPut,
  ContextDocContent,
  ContextDocList,
} from "@devdigest/shared";

export type ContextOwnerKind = "agent" | "skill";

const ROOT = "project-context";

export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: [ROOT, "docs", repoId],
    queryFn: () => api.get<ContextDocList>(`/repos/${repoId}/context/docs`),
    enabled: !!repoId,
  });
}

export function useContextDocContent(
  repoId: string | null | undefined,
  path: string | null | undefined,
) {
  return useQuery({
    queryKey: [ROOT, "content", repoId, path],
    queryFn: () =>
      api.get<ContextDocContent>(
        `/repos/${repoId}/context/docs/content?path=${encodeURIComponent(path ?? "")}`,
      ),
    enabled: !!repoId && !!path,
    retry: false,
  });
}

export function useContextAttachments(
  kind: ContextOwnerKind,
  ownerId: string | null | undefined,
  repoId: string | null | undefined,
) {
  return useQuery({
    queryKey: [ROOT, "attachments", kind, ownerId, repoId],
    queryFn: () =>
      api.get<ContextAttachmentList>(
        `/${kind}s/${ownerId}/context?repo_id=${encodeURIComponent(repoId ?? "")}`,
      ),
    enabled: !!ownerId && !!repoId,
  });
}

export interface SetContextAttachmentsInput extends ContextAttachmentPut {
  ownerId: string;
}

export function useSetContextAttachments(kind: ContextOwnerKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ownerId, repo_id, paths }: SetContextAttachmentsInput) =>
      api.put<ContextAttachmentList>(`/${kind}s/${ownerId}/context`, { repo_id, paths }),
    onSuccess: (data, { ownerId, repo_id }) => {
      qc.setQueryData([ROOT, "attachments", kind, ownerId, repo_id], data);
      // `used_by` on the Project Context page moves with every attachment change.
      qc.invalidateQueries({ queryKey: [ROOT, "docs", repo_id] });
    },
  });
}
