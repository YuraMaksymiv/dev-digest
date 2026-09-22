import type { CSSProperties } from "react";

/** Width of the hover preview, and how far below the badges it sits. */
const POPOVER_WIDTH = 440;
const POPOVER_GAP = 8;
/** Flip the popover above the row when it wouldn't fit below. */
const POPOVER_MAX_HEIGHT = 360;

/** Co-located styles for FindingsCell. */
export const cellStyles = {
  cell: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
    outline: "none",
  } satisfies CSSProperties,
  popHeader: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  popItem: {
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 5,
  } satisfies CSSProperties,
  popTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  popTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  popMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  popFile: { fontSize: 12, color: "var(--accent-text)" } satisfies CSSProperties,
  popBody: {
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } as CSSProperties,
  popMore: {
    padding: "8px 14px",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;

/**
 * Fixed-position box anchored to the badges. Fixed rather than absolute because
 * the PR table card clips its children (`overflow: hidden`).
 */
export function popoverAt(r: DOMRect): CSSProperties {
  const below = r.bottom + POPOVER_GAP;
  const flip = below + POPOVER_MAX_HEIGHT > window.innerHeight;
  const left = Math.min(r.left, Math.max(8, window.innerWidth - POPOVER_WIDTH - 8));
  return {
    position: "fixed",
    top: flip ? undefined : below,
    bottom: flip ? window.innerHeight - r.top + POPOVER_GAP : undefined,
    left,
    width: POPOVER_WIDTH,
    maxHeight: POPOVER_MAX_HEIGHT,
    overflowY: "auto",
    zIndex: 50,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    boxShadow: "0 12px 32px rgba(0,0,0,.35)",
    cursor: "default",
    textTransform: "none",
  };
}
