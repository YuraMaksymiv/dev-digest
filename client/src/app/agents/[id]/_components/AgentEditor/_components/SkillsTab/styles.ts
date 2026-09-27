import type { CSSProperties } from "react";

/** Co-located styles for the agent's Skills tab. */
export const s = {
  wrap: { padding: "20px 28px 40px", maxWidth: 1040 } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  } satisfies CSSProperties,
  h2: { fontSize: 17, fontWeight: 700 } satisfies CSSProperties,
  filter: { marginLeft: "auto", width: 240 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  row: (enabled: boolean, dragOver: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    marginBottom: 6,
    borderRadius: 8,
    border: `1px solid ${dragOver ? "var(--accent)" : "var(--border)"}`,
    background: enabled ? "var(--accent-bg)" : "var(--bg-elevated)",
  }),
  handle: { color: "var(--text-muted)", cursor: "grab", display: "inline-flex" } satisfies CSSProperties,
  name: (struck: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: 500,
    textDecoration: struck ? "line-through" : "none",
    color: struck ? "var(--text-muted)" : "var(--text-primary)",
  }),
  spacer: { flex: 1 } satisfies CSSProperties,
  globalHint: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  arrows: { display: "flex", gap: 2 } satisfies CSSProperties,
  footer: {
    marginTop: 14,
    fontSize: 12,
    color: "var(--text-muted)",
    minHeight: 18,
  } satisfies CSSProperties,
} as const;
