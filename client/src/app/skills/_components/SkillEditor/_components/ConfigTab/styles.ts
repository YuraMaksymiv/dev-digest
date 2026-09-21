import type { CSSProperties } from "react";

/** Co-located styles for the skill ConfigTab. */
export const s = {
  wrap: {
    padding: "20px 28px 40px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 940,
  } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
  } satisfies CSSProperties,
  enabledText: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  enabledHint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  tokenHint: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 } satisfies CSSProperties,
} as const;
