import type { CSSProperties } from "react";

/** Co-located styles for the skill ConfigTab. */
export const s = {
  // No flex gap here: FormField already carries `marginBottom: 20`, so a gap
  // on the container stacks on top of it and double-spaces the whole form.
  wrap: { padding: "20px 28px 40px", maxWidth: 760 } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  } satisfies CSSProperties,
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
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 } satisfies CSSProperties,
} as const;
