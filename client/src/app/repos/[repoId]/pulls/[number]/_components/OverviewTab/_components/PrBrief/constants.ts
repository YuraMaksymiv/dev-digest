import type { Risk } from "@devdigest/shared";

export type RiskSeverityKey = Risk["severity"];

export const SEVERITY_COLOR: Record<RiskSeverityKey, { fg: string; bg: string }> = {
  high: { fg: "var(--crit)", bg: "var(--crit-bg)" },
  medium: { fg: "var(--warn)", bg: "var(--warn-bg)" },
  low: { fg: "var(--info)", bg: "var(--info-bg)" },
};
