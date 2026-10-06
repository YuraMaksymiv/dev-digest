/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV } from "@devdigest/ui";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor, severityLabelFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";
import { FindingCard } from "@/components/finding-card";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";

/** Highest-severity finding anchored to this line, CRITICAL first. */
const SEVERITY_RANK = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 } as const;
function topSeverity(findings: FindingRecord[] | undefined): keyof typeof SEVERITY_RANK | undefined {
  if (!findings || findings.length === 0) return undefined;
  return findings
    .map((f) => f.severity as keyof typeof SEVERITY_RANK)
    .filter((sev) => sev in SEVERITY_RANK)
    .sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])[0];
}

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings,
  showFindings = true,
  onFindingAction,
  findingActionPending,
  repoFullName,
  headSha,
  target: isTarget,
  rowRef,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  findings?: FindingRecord[];
  showFindings?: boolean;
  onFindingAction?: (findingId: string, action: FindingActionKind) => void;
  findingActionPending?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Deep-link target line: highlighted and exposed via `rowRef` for scrolling. */
  target?: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
}) {
  const t = useTranslations("shell");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  const sev = showFindings ? topSeverity(findings) : undefined;
  const sevColor = sev ? SEV[sev].c : undefined;

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        ref={rowRef}
        style={lineRowFor(ln.kind, sevColor, isTarget)}
        aria-current={isTarget ? "true" : undefined}
      >
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {sev && (
          <span className="mono" style={severityLabelFor(sevColor!)}>
            {t(`diffViewer.severityLabel.${sev}`)}
          </span>
        )}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {showFindings && findings && findings.length > 0 && (
        <div style={cs.thread}>
          {findings.map((f) => (
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

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
