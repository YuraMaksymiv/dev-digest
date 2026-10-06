"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import {
  DiffViewer,
  type DiffCommentApi,
  type FocusTarget,
  type SmartDiffViewerData,
} from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useFindingAction, useSmartDiff } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { FindingRecord, PrFile } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  findings: FindingRecord[];
  repoFullName?: string | null;
  headSha?: string | null;
  /** File (and optional line) to scroll to, expand and highlight (deep link from the PR brief). */
  focusTarget?: FocusTarget | null;
}

export function DiffTab({
  prId,
  filesCount,
  files,
  canComment,
  findings,
  repoFullName,
  headSha,
  focusTarget,
}: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff } = useSmartDiff(prId);
  const action = useFindingAction();
  const [order, setOrder] = React.useState<"smart" | "original">("smart");
  // GitHub comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  // Findings start VISIBLE (P1: expanding a file must show its finding, no extra
  // click) — the same toggle below can still hide them together with GitHub
  // comments for a clean diff.
  const [showFindings, setShowFindings] = React.useState(true);

  const commentCount = comments?.length ?? 0;
  const anyExtrasVisible = showComments || showFindings;

  const findingsByFile = React.useMemo(() => {
    const map = new Map<string, FindingRecord[]>();
    for (const f of findings) {
      const list = map.get(f.file) ?? [];
      list.push(f);
      map.set(f.file, list);
    }
    return map;
  }, [findings]);

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const smartDiffData: SmartDiffViewerData = {
    groups: smartDiff?.groups,
    order,
    findingsByFile,
    showFindings,
    onFindingAction: (findingId, act) => {
      if (prId) action.mutate({ findingId, action: act, prId });
    },
    findingActionPending: action.isPending,
    repoFullName,
    headSha,
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button
              kind="ghost"
              size="sm"
              onClick={() => setOrder((o) => (o === "smart" ? "original" : "smart"))}
            >
              {order === "smart" ? t("smartDiff.originalOrder") : t("smartDiff.smartOrder")}
            </Button>
            {(commentCount > 0 || findings.length > 0) && (
              <Button
                kind="ghost"
                size="sm"
                icon={anyExtrasVisible ? "EyeOff" : "Eye"}
                onClick={() => {
                  const next = !anyExtrasVisible;
                  setShowComments(next);
                  setShowFindings(next);
                }}
              >
                {anyExtrasVisible ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>
      <DiffViewer
        files={files}
        commenting={commenting}
        smartDiff={smartDiffData}
        focusTarget={focusTarget}
      />
    </section>
  );
}
