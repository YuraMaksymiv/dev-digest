import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic tier — the real on-disk harness (CLAUDE.md + skills + subagents) via
 * settingSources:["project"], read-only tools only. 5 sessions per run:
 *   trace (1) · activation pair (2) · CLAUDE.md contrast treatment + control (2).
 */
export const cases: WorkflowCase[] = [
  {
    kind: "trace",
    name: "endpoint task reads api-surface.md AND dispatches architecture-reviewer",
    prompt:
      "Я планую додати новий ендпоінт GET /reviews/:id/export (віддає ревʼю як markdown). " +
      "Спершу звірся з конвенціями API цього репо. Потім запусти сабагента architecture-reviewer, " +
      "щоб він оцінив мій план на відповідність onion-шарам — не рецензуй сам.",
    expectFilesRead: ["server/docs/api-surface.md"],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 10,
  },
  {
    kind: "activation",
    name: "engineering-insights activates on a found bug cause",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — a plain question must NOT activate engineering-insights",
    prompt: "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },
  {
    kind: "contrast",
    name: "CLAUDE.md 'Read when' routes an endpoint change to api-surface.md (control: no project context)",
    prompt:
      "I need to add a new HTTP endpoint to this project. Before writing any code, read the project's " +
      "documentation on its API conventions and summarize the rules I must follow.",
    expectFileRead: "server/docs/api-surface.md",
    maxTurns: 6,
  },
];
