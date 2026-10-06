/* hooks/project-context.ts — React Query hooks for Project Context: the repo's
   markdown docs and the per-repo doc set attached to an agent or a skill. Query
   keys live under "project-context", distinct from the legacy ["context", id]. */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useRepoIntelStatus, type RepoIntelState } from "./repo-intel";
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

/** How often the reindex completion poll runs (matches `useRepoIntelStatus`) and how many
    polls to wait before giving up: 40 × 1.5 s = 60 s. */
export const REINDEX_POLL_LIMIT = 40;

interface ReindexResponse {
  status: string;
  jobId?: string;
  degraded?: boolean;
  reason?: string;
}

/** Starts a repo-intel resync through the Project Context route and tracks it to
    completion by watching the index state advance. `onError` fires on a failed
    request, a degraded response or when the poll limit is hit; on success the
    doc list is re-fetched. */
export function useReindexProjectContext(repoId: string | null | undefined, onError: () => void) {
  const qc = useQueryClient();
  const [running, setRunning] = React.useState(false);
  const baseline = React.useRef<RepoIntelState | null>(null);
  const polls = React.useRef(0);
  const busy = React.useRef(false);
  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;

  const state = useRepoIntelStatus(repoId, running);

  const finish = React.useCallback(
    (ok: boolean) => {
      busy.current = false;
      baseline.current = null;
      setRunning(false);
      if (ok) {
        qc.invalidateQueries({ queryKey: [ROOT, "docs", repoId] });
        qc.invalidateQueries({ queryKey: [ROOT, "content", repoId] });
      } else {
        onErrorRef.current();
      }
    },
    [qc, repoId],
  );

  React.useEffect(() => {
    const before = baseline.current;
    if (!running || !before || !state.data) return;
    polls.current += 1;
    if (
      state.data.lastIndexedSha !== before.lastIndexedSha ||
      state.data.updatedAt !== before.updatedAt
    ) {
      finish(true);
    } else if (polls.current >= REINDEX_POLL_LIMIT) {
      finish(false);
    }
  }, [state.dataUpdatedAt, running, state.data, finish]);

  const start = React.useCallback(async () => {
    if (busy.current || !repoId) return;
    busy.current = true;
    polls.current = 0;
    setRunning(true);
    try {
      const before = await api.get<RepoIntelState>(`/repos/${repoId}/index-state`);
      const res = await api.post<ReindexResponse>(`/repos/${repoId}/context/reindex`);
      if (res.degraded) throw new Error(res.reason ?? "degraded");
      baseline.current = before;
    } catch {
      finish(false);
    }
  }, [repoId, finish]);

  return { start, running };
}
