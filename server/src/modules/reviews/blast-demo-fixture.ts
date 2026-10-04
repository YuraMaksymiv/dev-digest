/**
 * Demo-only fixture for the Blast Radius test PR — a brand-new, unused export
 * so this PR's "no downstream callers" state is real and reproducible: the
 * symbol exists (changed_symbols.length === 1) but nothing in the indexed
 * call graph references it yet. Not wired into any route; safe to delete
 * once the demo is recorded.
 */
export function formatBlastDemoLabel(symbolCount: number): string {
  return symbolCount === 1 ? '1 changed symbol' : `${symbolCount} changed symbols`;
}
