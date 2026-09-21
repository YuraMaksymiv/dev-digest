import type { CSSProperties } from "react";

/** Co-located styles for NewSkillModal. Modal gives its children no padding. */
export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
