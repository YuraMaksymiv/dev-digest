import type { CSSProperties } from "react";

/** Co-located styles for the import modal. */
export const s = {
  // `Modal` gives its children no padding, and `FormField` carries its own
  // bottom margin — a plain padded block, never a flex column with a gap.
  body: { padding: 24 } satisfies CSSProperties,
  fetchRow: { display: "flex", gap: 8, alignItems: "flex-start" } satisfies CSSProperties,
  fetchInput: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  sourceNote: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    marginBottom: 20,
    wordBreak: "break-all",
  } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
  fileInput: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
