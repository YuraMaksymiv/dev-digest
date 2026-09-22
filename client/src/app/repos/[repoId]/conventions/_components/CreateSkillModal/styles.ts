import type { CSSProperties } from "react";

/** Co-located styles for the Create-skill modal. */
export const s = {
  // `Modal` gives its children no padding, and `FormField` already carries its
  // own bottom margin — so this is a plain padded block, never a flex column
  // with a gap (that would double-space every field).
  body: { padding: 24 } satisfies CSSProperties,
  banner: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    marginBottom: 20,
  } satisfies CSSProperties,
  row: { display: "flex", gap: 16 } satisfies CSSProperties,
  rowItem: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", marginTop: 4 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
