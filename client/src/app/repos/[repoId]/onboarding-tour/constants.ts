export const SECTION_IDS = [
  "architecture",
  "critical-paths",
  "run-locally",
  "reading-path",
  "first-tasks",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_LABEL_KEYS: Record<SectionId, string> = {
  architecture: "sections.architecture",
  "critical-paths": "sections.criticalPaths",
  "run-locally": "sections.runLocally",
  "reading-path": "sections.readingPath",
  "first-tasks": "sections.firstTasks",
};

export const SECTION_ICONS = {
  architecture: "Layers",
  "critical-paths": "Zap",
  "run-locally": "Code",
  "reading-path": "FileText",
  "first-tasks": "Target",
} as const;

export const anchorId = (id: SectionId) => `onboarding-${id}`;

export const COPIED_RESET_MS = 1500;
