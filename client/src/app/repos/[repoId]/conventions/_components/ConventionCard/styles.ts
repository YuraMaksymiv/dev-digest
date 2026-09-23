import type { CSSProperties } from "react";

/** Co-located styles for one convention candidate card. */
export const s = {
  // The category stripe is a longhand `borderLeft`, so the card's own frame is
  // declared with longhands too — React warns when a shorthand and a longhand
  // for the same edge both update on a rerender.
  card: (accent: string, dimmed: boolean): CSSProperties => ({
    borderTop: "1px solid var(--border)",
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    borderLeft: `3px solid ${accent}`,
    borderRadius: 10,
    background: "var(--bg-surface)",
    padding: 16,
    opacity: dimmed ? 0.55 : 1,
  }),
  topRow: { display: "flex", alignItems: "flex-start", gap: 16 } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  rule: {
    fontSize: 14,
    fontWeight: 600,
    fontStyle: "italic",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  rationale: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    marginTop: 6,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 8, marginTop: 10 } satisfies CSSProperties,
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    flexShrink: 0,
    width: 132,
  } satisfies CSSProperties,
  evidence: {
    marginTop: 12,
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-base)",
  } satisfies CSSProperties,
  evidenceHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11.5,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12,
    lineHeight: 1.6,
    fontFamily: "var(--font-mono)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowX: "auto",
  } satisfies CSSProperties,
  confidenceRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  } satisfies CSSProperties,
  confidenceLabel: {
    fontSize: 11,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  } satisfies CSSProperties,
  bar: { width: 120 } satisfies CSSProperties,
  editBlock: { display: "block" } satisfies CSSProperties,
  editActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  } satisfies CSSProperties,
} as const;
