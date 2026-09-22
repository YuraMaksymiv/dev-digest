/**
 * Shared cost/token formatting for the review-run surfaces: the PR list's Cost
 * column, the PR timeline row, the Review Runs accordion header, and the run
 * trace's Stats tile. One rule everywhere, so the same run never reads as two
 * different numbers on two screens.
 *
 * Decimals widen as the amount shrinks — review runs routinely land in the
 * fractions of a cent, where a flat 2dp would collapse every run to "$0.00".
 */

/** Em dash for an unknown cost (no price for the model, or the run failed). */
const UNKNOWN = "—";

/**
 * USD cost for display: `$0.0013` / `$0.014` / `$1.24`.
 * Null or undefined = UNKNOWN, which is NOT the same as a genuine `$0.00`
 * (free models really do cost nothing).
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return UNKNOWN;
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Token count with thousands separators, e.g. 9119 → "9,119". */
export function formatTokenCount(n: number): string {
  return n.toLocaleString("en-US");
}
