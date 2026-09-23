import type { ConventionCandidate } from "@devdigest/shared";
import { CONFIDENCE_HIGH, CONFIDENCE_MID, type StatusFilter } from "./constants";

/** Pure derivations for the conventions triage screen. No React, no I/O. */

export interface StatusCounts {
  all: number;
  pending: number;
  accepted: number;
  rejected: number;
}

export function countByStatus(candidates: ConventionCandidate[]): StatusCounts {
  return candidates.reduce<StatusCounts>(
    (acc, c) => {
      acc.all++;
      acc[c.status]++;
      return acc;
    },
    { all: 0, pending: 0, accepted: 0, rejected: 0 },
  );
}

export function filterByStatus(
  candidates: ConventionCandidate[],
  filter: StatusFilter,
): ConventionCandidate[] {
  return filter === "all" ? candidates : candidates.filter((c) => c.status === filter);
}

/**
 * `src/api/users.ts:23` — the line is dropped when the gate could not pin one,
 * because `path:null` would read as a real location.
 */
export function evidenceLabel(c: ConventionCandidate): string {
  return c.evidence_line ? `${c.evidence_path}:${c.evidence_line}` : c.evidence_path;
}

/** Colour for a confidence bar, in the same bands as `ConfidenceNum`. */
export function confidenceColor(value: number): string {
  if (value >= CONFIDENCE_HIGH) return "var(--ok)";
  if (value >= CONFIDENCE_MID) return "var(--warn)";
  return "var(--text-muted)";
}

/**
 * True when the rationale says something the rule did not. Models routinely
 * echo the rule back into this field, and rendering the same sentence twice
 * reads as a bug — so the card shows it only when it adds something.
 */
export function hasDistinctRationale(c: ConventionCandidate): boolean {
  if (!c.rationale) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(c.rationale) !== norm(c.rule);
}
