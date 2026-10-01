import type { BlastRadius } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

export function blastStats(blast: BlastRadius): BlastStats {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const d of blast.downstream) {
    callers += d.callers.length;
    d.endpoints_affected.forEach((e) => endpoints.add(e));
    d.crons_affected.forEach((c) => crons.add(c));
  }
  return { symbols: blast.changed_symbols.length, callers, endpoints: endpoints.size, crons: crons.size };
}

/** Pinned to the PR head so the line stays accurate; plain text when we can't build a link. */
export function callerHref(
  repoFullName: string | null | undefined,
  headSha: string | null | undefined,
  file: string,
  line: number,
): string | undefined {
  if (!repoFullName || !headSha) return undefined;
  return githubBlobUrl(repoFullName, headSha, file, line);
}
