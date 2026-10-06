import type { LogLine } from "@devdigest/ui";
import type { ContextDocRoot, RunTrace, SpecDetail } from "@devdigest/shared";

interface RawEvent {
  t: string;
  kind: string;
  msg: string;
}

/** Map run-bus events to the LiveLogStream LogLine shape. */
export function eventsToLog(events: RawEvent[]): LogLine[] {
  return events.map((e) => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg }));
}

/** Map a persisted trace's log to the LiveLogStream LogLine shape. */
export function traceLog(trace: RunTrace | undefined): LogLine[] {
  return trace?.log.map((l) => ({ t: l.t, k: l.kind as LogLine["k"], m: l.msg })) ?? [];
}

/** Seconds-formatted duration. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}

const SPEC_GROUPS: readonly ContextDocRoot[] = ["specs", "docs", "insights"];

/**
 * Specs-read entries grouped by `root_type` (specs, docs, insights; empty groups
 * dropped). Returns null when any entry lacks it — traces persisted before the
 * grouping amendment render ungrouped.
 */
export function groupSpecDetails(
  details: SpecDetail[],
): { group: ContextDocRoot; items: SpecDetail[] }[] | null {
  if (details.some((d) => !d.root_type)) return null;
  return SPEC_GROUPS.map((group) => ({ group, items: details.filter((d) => d.root_type === group) })).filter(
    (g) => g.items.length > 0,
  );
}
