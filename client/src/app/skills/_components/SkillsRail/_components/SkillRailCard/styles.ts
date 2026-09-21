import type { CSSProperties } from "react";

/** Co-located styles for SkillRailCard. */
export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent-bg)" : "var(--bg-elevated)",
    marginBottom: 8,
    cursor: "pointer",
    opacity: enabled ? 1 : 0.55,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  name: {
    flex: 1,
    fontSize: 13,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  description: {
    fontSize: 12,
    color: "var(--text-secondary)",
    marginTop: 4,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  } satisfies CSSProperties,
  usage: { fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" } satisfies CSSProperties,
} as const;
