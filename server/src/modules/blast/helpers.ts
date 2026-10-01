import type { BlastDegradedReason, BlastRadius } from '@devdigest/shared';
import { BLAST_CALLER_CAP } from './constants.js';

/**
 * Pure helpers for the blast module — facade result → wire contract, and the
 * degraded-reason refinement. No I/O.
 *
 * Input shapes are declared STRUCTURALLY (see skills/helpers.ts): the facade's
 * own types live in a sibling module, and a `BlastResult` / `IndexState`
 * satisfies these by shape.
 */

export interface BlastResultLike {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: { file: string; symbol: string; viaSymbol: string; line: number; rank: number }[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: BlastDegradedReason;
}

export interface BlastIndexStateLike {
  status: string;
  degradedReason?: BlastDegradedReason;
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function buildSummary(
  symbols: number,
  callers: number,
  endpoints: number,
  crons: number,
  capped: boolean,
): string {
  if (symbols === 0) return 'No changed symbols were found in this PR.';
  if (callers === 0) {
    return `${plural(symbols, 'changed symbol', 'changed symbols')}, no downstream callers found.`;
  }
  const parts = [
    `${plural(symbols, 'changed symbol', 'changed symbols')} reach ${plural(callers, 'caller', 'callers')}`,
  ];
  if (endpoints > 0) parts.push(plural(endpoints, 'endpoint', 'endpoints'));
  if (crons > 0) parts.push(plural(crons, 'cron job', 'cron jobs'));
  return `${parts.join(', ')}.${capped ? ` (top ${BLAST_CALLER_CAP} callers shown)` : ''}`;
}

export function mapBlastResult(result: BlastResultLike): BlastRadius {
  const changed_symbols = [...result.changedSymbols]
    .sort((a, b) => byString(a.file, b.file) || byString(a.name, b.name))
    .map((s) => ({ name: s.name, file: s.file, kind: s.kind }));

  const callers = [...result.callers].sort(
    (a, b) =>
      b.rank - a.rank ||
      byString(a.file, b.file) ||
      a.line - b.line ||
      byString(a.symbol, b.symbol),
  );

  const groups = new Map<string, { maxRank: number; rows: typeof callers }>();
  for (const c of callers) {
    const g = groups.get(c.viaSymbol);
    if (g) {
      g.rows.push(c);
      g.maxRank = Math.max(g.maxRank, c.rank);
    } else {
      groups.set(c.viaSymbol, { maxRank: c.rank, rows: [c] });
    }
  }

  const allEndpoints = new Set<string>();
  const allCrons = new Set<string>();
  const downstream = [...groups.entries()]
    .sort(([an, a], [bn, b]) => b.maxRank - a.maxRank || byString(an, bn))
    .map(([symbol, g]) => {
      const endpoints = new Set<string>();
      const crons = new Set<string>();
      for (const row of g.rows) {
        const facts = result.factsByFile?.[row.file];
        for (const e of facts?.endpoints ?? []) endpoints.add(e);
        for (const c of facts?.crons ?? []) crons.add(c);
      }
      endpoints.forEach((e) => allEndpoints.add(e));
      crons.forEach((c) => allCrons.add(c));
      return {
        symbol,
        callers: g.rows.map((r) => ({ name: r.symbol, file: r.file, line: r.line })),
        endpoints_affected: [...endpoints].sort(byString),
        crons_affected: [...crons].sort(byString),
      };
    });

  return {
    changed_symbols,
    downstream,
    summary: buildSummary(
      changed_symbols.length,
      callers.length,
      allEndpoints.size,
      allCrons.size,
      callers.length >= BLAST_CALLER_CAP,
    ),
    ...(result.degraded ? { degraded: true, reason: result.reason ?? 'no_data' } : {}),
  };
}

/**
 * The facade only ever tags its own result `no_data`; the index state knows why.
 * Precedence: flag off, then what the index itself recorded (failed/degraded →
 * its reason, partial → `index_partial`), otherwise keep the facade's reason.
 * Returns `null` when there is nothing to flag (healthy result, healthy index).
 */
export function refineBlastReason(
  result: Pick<BlastResultLike, 'degraded' | 'reason'>,
  state: BlastIndexStateLike | null,
  flagEnabled: boolean,
): BlastDegradedReason | null {
  if (!flagEnabled) return 'flag_off';
  if (state?.status === 'failed') return state.degradedReason ?? 'index_failed';
  if (state?.status === 'degraded' && state.degradedReason && state.degradedReason !== 'no_data') {
    return state.degradedReason;
  }
  if (state?.status === 'partial') return 'index_partial';
  if (result.degraded) return result.reason ?? 'no_data';
  return null;
}
