import type { CSSProperties } from "react";
import type { GraphNodeKind } from "../../helpers";

export const NODE_COLOR: Record<GraphNodeKind, string> = {
  symbol: "var(--accent)",
  caller: "var(--border-strong)",
  endpoint: "var(--accent-text)",
  cron: "var(--warn)",
};

export const s = {
  svg: { width: "100%", height: "auto", display: "block" } satisfies CSSProperties,
  edge: { fill: "none", stroke: "var(--text-muted)", strokeOpacity: 0.45, strokeWidth: 1.2 } satisfies CSSProperties,
  nodeText: {
    fontSize: 13,
    fill: "var(--text-primary)",
  } satisfies CSSProperties,
  legend: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    marginTop: 12,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  dot: { width: 8, height: 8, borderRadius: 99 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
