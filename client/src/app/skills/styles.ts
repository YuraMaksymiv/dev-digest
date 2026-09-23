import type { CSSProperties } from "react";

/** Co-located styles for the /skills routes (rail + editor shell). */
export const s = {
  split: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  rail: {
    width: 300,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  railHeader: { padding: "16px 16px 12px" } satisfies CSSProperties,
  railTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  railList: { flex: 1, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
  detail: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
  } satisfies CSSProperties,
  detailHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 28px 0",
    flexShrink: 0,
  } satisfies CSSProperties,
  detailTitle: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  detailBody: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
  detailLoading: {
    flex: 1,
    padding: 28,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  placeholder: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } satisfies CSSProperties,
} as const;
