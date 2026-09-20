import type { FindingRecord } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITIES, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings, keep one severity, and sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severityFilter: string | null = null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severityFilter) shown = shown.filter((f) => f.severity === severityFilter);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/**
 * Count findings per severity, in SEVERITIES order. Only severities this run
 * actually produced get an entry — a level with no findings is left out rather
 * than shown as 0. Counts cover ALL findings of the run (dismissed included),
 * matching the cards the panel renders.
 */
export function severityCounts(findings: FindingRecord[]): Array<[string, number]> {
  return SEVERITIES.map(
    (sev) => [sev, findings.filter((f) => f.severity === sev).length] as [string, number],
  ).filter(([, count]) => count > 0);
}
