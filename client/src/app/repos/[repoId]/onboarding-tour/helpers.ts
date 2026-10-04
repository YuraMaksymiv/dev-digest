import type { OnboardingResponse } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "2 hours ago" style label; sub-minute collapses to "just now". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  if (Number.isNaN(diff)) return iso;
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return fmt.format(Math.round(diff / ms), unit);
  }
  return fmt.format(0, "second");
}

/** GitHub blob link pinned to the indexed sha; null when no sha is known. */
export function openUrl(
  fullName: string | undefined,
  sha: string | null,
  path: string,
): string | null {
  if (!fullName || !sha) return null;
  return githubBlobUrl(fullName, sha, path);
}

export function totalTokens(usage: NonNullable<OnboardingResponse["usage"]>): number {
  return usage.tokens_in + usage.tokens_out;
}
