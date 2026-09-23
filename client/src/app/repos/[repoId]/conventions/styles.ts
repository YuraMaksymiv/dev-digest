import type { CSSProperties } from "react";

/** Co-located styles for the conventions triage screen. */
export const s = {
  page: { padding: "22px 28px 40px", maxWidth: 1100 } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 6,
  } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700 } satisfies CSSProperties,
  repoName: { color: "var(--accent)", fontFamily: "var(--font-mono)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  scanSummary: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
    marginTop: 10,
  } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "18px 0 16px",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  toolbarSpacer: { flex: 1 } satisfies CSSProperties,
  acceptedCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  error: { marginBottom: 16 } satisfies CSSProperties,
} as const;
