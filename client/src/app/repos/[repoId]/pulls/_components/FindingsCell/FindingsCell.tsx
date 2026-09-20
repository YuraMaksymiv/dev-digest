/* FindingsCell — the PR list's per-severity findings breakdown for one row,
   with a read-only hover preview of that review's findings. Counts come from
   the latest review (same run as SCORE). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, CategoryTag, ConfidenceNum, Icon, type Category } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { s } from "../../styles";
import { cellStyles, popoverAt } from "./styles";

/** The severities the list breakdown carries (the UI `Severity` union is wider). */
type Breakdown = NonNullable<PrMeta["findings"]>;

/** Display order — highest severity first, matching the findings panel. */
const ORDER: (keyof Breakdown)[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export function FindingsCell({
  findings,
  preview,
}: {
  findings: PrMeta["findings"];
  preview?: PrMeta["findings_preview"];
}) {
  const t = useTranslations("prReview");
  const anchor = React.useRef<HTMLDivElement>(null);
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  // null/undefined ⇒ never reviewed. An all-zero breakdown means "reviewed,
  // found nothing" — still a dash, but the row already reads that from SCORE.
  const entries = findings
    ? ORDER.map((sev) => [sev, findings[sev]] as const).filter(([, n]) => n > 0)
    : [];
  const total = findings ? findings.CRITICAL + findings.WARNING + findings.SUGGESTION : 0;
  const shown = preview ?? [];
  const hidden = total - shown.length;

  if (entries.length === 0) return <div style={s.muted}>—</div>;

  // The popover is `position: fixed` on purpose: the table card clips its
  // children (`overflow: hidden`), which would cut an absolutely-positioned one.
  const open = () => setRect(anchor.current?.getBoundingClientRect() ?? null);

  return (
    <div
      ref={anchor}
      // Focusable, so the preview is reachable without a pointer — which needs
      // a name, or it lands in the a11y tree as an unlabelled generic.
      aria-label={t("list.findingsPreview.cellLabel", { count: total })}
      style={cellStyles.cell}
      onMouseEnter={open}
      onMouseLeave={() => setRect(null)}
      onFocus={open}
      onBlur={() => setRect(null)}
      tabIndex={0}
    >
      {entries.map(([sev, n]) => (
        <SeverityBadge key={sev} severity={sev} count={n} compact />
      ))}

      {rect && shown.length > 0 && (
        <div role="tooltip" style={popoverAt(rect)}>
          <div style={cellStyles.popHeader}>
            <Icon.AlertOctagon size={13} />
            {t("list.findingsPreview.title", { count: total })}
          </div>
          {shown.map((f, i) => (
            <div key={`${f.file}:${f.start_line}:${i}`} style={cellStyles.popItem}>
              <div style={cellStyles.popTitleRow}>
                <SeverityBadge severity={f.severity} compact />
                <span style={cellStyles.popTitle}>{f.title}</span>
                <CategoryTag category={f.category as Category} />
              </div>
              <div style={cellStyles.popMetaRow}>
                <span className="mono" style={cellStyles.popFile}>
                  {f.file}:{f.start_line}
                </span>
                <ConfidenceNum value={f.confidence} />
              </div>
              <div style={cellStyles.popBody}>{f.rationale}</div>
            </div>
          ))}
          {hidden > 0 && (
            <div style={cellStyles.popMore}>{t("list.findingsPreview.more", { count: hidden })}</div>
          )}
        </div>
      )}
    </div>
  );
}
