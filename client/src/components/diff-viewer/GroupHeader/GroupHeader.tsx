/* GroupHeader — Smart Diff group header: role label, chevron collapse/expand,
   file count, and (when any) a "N files have findings" count. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiffRole } from "@devdigest/shared";
import { s, chevronFor } from "../styles";

const ROLE_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreLabel",
  tests: "smartDiff.testsLabel",
  wiring: "smartDiff.wiringLabel",
  docs: "smartDiff.docsLabel",
  boilerplate: "smartDiff.boilerplateLabel",
};

export function GroupHeader({
  role,
  fileCount,
  findingFileCount,
  open,
  onToggle,
}: {
  role: SmartDiffRole;
  fileCount: number;
  findingFileCount: number;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div onClick={onToggle} style={s.groupHeader}>
      <Icon.ChevronRight size={13} style={chevronFor(open)} />
      <span style={s.groupLabel}>{t(ROLE_LABEL_KEY[role])}</span>
      <span style={s.groupMeta}>{t("smartDiff.filesCount", { count: fileCount })}</span>
      {findingFileCount > 0 && (
        <span style={s.groupMeta}>
          {t("smartDiff.filesWithFindings", { count: findingFileCount })}
        </span>
      )}
    </div>
  );
}
