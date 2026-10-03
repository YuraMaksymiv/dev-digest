import type { IconName } from "@devdigest/ui";

export const BLAST_VIEWS = ["tree", "graph"] as const;
export type BlastView = (typeof BLAST_VIEWS)[number];

export const CALLABLE_KINDS = new Set(["function", "method"]);

export const GRAPH = {
  width: 540,
  nodeWidth: 150,
  nodeHeight: 34,
  rowPitch: 54,
  padY: 8,
  labelMax: 17,
  columnCenters: [78, 270, 462] as const,
} as const;

export const STAT_KEYS = ["symbols", "callers", "endpoints", "crons"] as const;
export const STAT_ICON: Record<(typeof STAT_KEYS)[number], IconName> = {
  symbols: "Code",
  callers: "CornerDownRight",
  endpoints: "Globe",
  crons: "Clock",
};
