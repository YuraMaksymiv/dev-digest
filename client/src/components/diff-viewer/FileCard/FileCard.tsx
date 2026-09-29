/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
  cs,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { FindingCard } from "@/components/finding-card";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/**
 * Anchor each finding to the first rendered line in its range: exact match on
 * `start_line` first, else the first rendered line within
 * `[start_line, end_line]` (mirrors `keysForLine`/`partitionThreads`'s
 * anchor-or-outdated technique for GitHub comment threads, applied to
 * findings instead). A finding with no anchorable line goes to `unmatched`
 * rather than silently vanishing.
 */
function anchorFindings(
  findings: FindingRecord[],
  lines: Line[],
): { byLine: Map<number, FindingRecord[]>; unmatched: FindingRecord[] } {
  const byLine = new Map<number, FindingRecord[]>();
  const unmatched: FindingRecord[] = [];
  for (const f of findings) {
    const exact = lines.find((ln) => ln.newNo === f.start_line);
    const inRange =
      exact ?? lines.find((ln) => ln.newNo != null && ln.newNo >= f.start_line && ln.newNo <= f.end_line);
    if (inRange?.newNo != null) {
      const list = byLine.get(inRange.newNo) ?? [];
      list.push(f);
      byLine.set(inRange.newNo, list);
    } else {
      unmatched.push(f);
    }
  }
  return { byLine, unmatched };
}

export function FileCard({
  file,
  commenting,
  hasFindings,
  findings,
  showFindings = true,
  onFindingAction,
  findingActionPending,
  repoFullName,
  headSha,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  hasFindings?: boolean;
  findings?: FindingRecord[];
  showFindings?: boolean;
  onFindingAction?: (findingId: string, action: FindingActionKind) => void;
  findingActionPending?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  const { byLine: findingsByLine, unmatched: unmatchedFindings } = React.useMemo(
    () => anchorFindings(findings ?? [], lines),
    [findings, lines],
  );

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
        {hasFindings && (
          <span aria-label={t("diffViewer.hasFindingsDot")} title={t("diffViewer.hasFindingsDot")} style={s.findingsDot} />
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={ln.newNo != null ? findingsByLine.get(ln.newNo) : undefined}
                showFindings={showFindings}
                onFindingAction={onFindingAction}
                findingActionPending={findingActionPending}
                repoFullName={repoFullName}
                headSha={headSha}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {showFindings && unmatchedFindings.length > 0 && (
            <div style={cs.outdatedWrap}>
              {unmatchedFindings.map((f) => (
                <FindingCard
                  key={f.id}
                  f={f}
                  pending={findingActionPending}
                  repoFullName={repoFullName}
                  headSha={headSha}
                  onAction={(act) => onFindingAction?.(f.id, act)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
