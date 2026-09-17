/* FindingsCell — the PR list's per-severity findings breakdown for one row.
   Counts come from the latest review (same run as SCORE and COST). */
"use client";

import React from "react";
import { SeverityBadge } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { s } from "../../styles";
import { cellStyles } from "./styles";

/** The severities the list breakdown carries (the UI `Severity` union is wider). */
type Breakdown = NonNullable<PrMeta["findings"]>;

/** Display order — highest severity first, matching the findings panel. */
const ORDER: (keyof Breakdown)[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export function FindingsCell({ findings }: { findings: PrMeta["findings"] }) {
  // null/undefined ⇒ never reviewed. An all-zero breakdown means "reviewed,
  // found nothing" — still a dash, but the row already reads that from SCORE.
  const entries = findings
    ? ORDER.map((sev) => [sev, findings[sev]] as const).filter(([, n]) => n > 0)
    : [];

  if (entries.length === 0) return <div style={s.muted}>—</div>;

  return (
    <div style={cellStyles.cell}>
      {entries.map(([sev, n]) => (
        <SeverityBadge key={sev} severity={sev} count={n} compact />
      ))}
    </div>
  );
}
