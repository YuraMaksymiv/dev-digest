/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline.
   Optional Smart Diff grouping: role-grouped headers + per-file/per-line
   finding indicators, injected via the `smartDiff` prop (data stays owned by
   the caller — DiffTab — this component only renders it). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import type { FindingActionKind, FindingRecord, SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";
import { type DiffCommentApi } from "../comments";
import { s } from "../styles";
import { orderFiles } from "../helpers";
import { FileCard } from "../FileCard";
import { GroupHeader } from "../GroupHeader";

export interface SmartDiffViewerData {
  groups?: SmartDiffGroup[];
  order: "smart" | "original";
  findingsByFile: Map<string, FindingRecord[]>;
  /** Finding comments are visible by default — independent of `commenting.showComments`,
   * which only gates GitHub comments. Set false to hide both from the same toggle. */
  showFindings: boolean;
  onFindingAction?: (findingId: string, action: FindingActionKind) => void;
  findingActionPending?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}

/** Groups collapsed by default — the reviewer usually wants core/tests open first. */
const DEFAULT_COLLAPSED: Partial<Record<SmartDiffRole, boolean>> = { docs: true, boilerplate: true };

export function DiffViewer({
  files,
  commenting,
  smartDiff,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  smartDiff?: SmartDiffViewerData;
}) {
  const t = useTranslations("shell");
  const [collapsed, setCollapsed] = React.useState(DEFAULT_COLLAPSED);

  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }

  const findingsFor = (path: string) => smartDiff?.findingsByFile.get(path) ?? [];

  const renderFileCard = (file: PrFile, key: React.Key) => {
    const fileFindings = findingsFor(file.path);
    return (
      <FileCard
        key={key}
        file={file}
        commenting={commenting}
        hasFindings={fileFindings.length > 0}
        findings={fileFindings}
        showFindings={smartDiff?.showFindings ?? true}
        onFindingAction={smartDiff?.onFindingAction}
        findingActionPending={smartDiff?.findingActionPending}
        repoFullName={smartDiff?.repoFullName}
        headSha={smartDiff?.headSha}
      />
    );
  };

  const ordered = orderFiles(files, smartDiff?.groups, smartDiff?.order ?? "original");

  if (ordered.kind === "flat") {
    return <div style={s.list}>{ordered.files.map((f, i) => renderFileCard(f, i))}</div>;
  }

  return (
    <div style={s.list}>
      {ordered.groups.map((g) => {
        const findingFileCount = g.files.filter((f) => findingsFor(f.path).length > 0).length;
        const open = !collapsed[g.role];
        return (
          <div key={g.role} style={s.group}>
            <GroupHeader
              role={g.role}
              fileCount={g.files.length}
              findingFileCount={findingFileCount}
              open={open}
              onToggle={() => setCollapsed((c) => ({ ...c, [g.role]: !c[g.role] }))}
            />
            {open && <div style={s.groupBody}>{g.files.map((f, i) => renderFileCard(f, i))}</div>}
          </div>
        );
      })}
    </div>
  );
}
