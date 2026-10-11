import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillCase } from "../../src/index.js";

// Quality cases run with no tools, so each fixture is inlined as numbered files the review can cite.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function listFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? listFiles(p) : [p];
    });
}

function inline(fixture: string): string {
  const root = join(FIXTURES, fixture);
  return listFiles(root)
    .map((p) => {
      const numbered = readFileSync(p, "utf8")
        .split("\n")
        .map((l, i) => `${String(i + 1).padStart(3)}  ${l}`)
        .join("\n");
      return `--- ${relative(root, p)}\n${numbered}`;
    })
    .join("\n\n");
}

export const cases: SkillCase[] = [
  {
    name: "notifications module: db in routes, concrete adapter in service, I/O in helpers",
    kind: "quality",
    prompt: `I just wrote a new \`notifications\` module for the server. Can you review it for architecture / layering problems before I open a PR? For each problem give file:line, what's wrong and how to fix it.\n\n${inline("01-notifications-module")}`,
    practices: [
      "flags routes.ts for querying the database directly (drizzle-orm / db/schema / container.db in the GET handler) and says the query belongs in NotificationRepository",
      "flags service.ts for importing and constructing OctokitGitHubClient and says to depend on the GitHubClient port resolved from the Container (container.github) instead",
      "flags helpers.ts for doing filesystem I/O (node:fs/promises readFile) and says template loading must move out of helpers (service/adapter), keeping interpolate pure",
      "does not report repository.ts as an architecture violation (it is the one file allowed to import drizzle-orm and db/schema)",
    ],
    threshold: 0.75,
  },
  {
    name: "labels module: leaked rows, missing transaction, fastify in service",
    kind: "quality",
    prompt: `Here's the \`labels\` module I added — GET and PUT labels on a PR. Anything off with how it's structured? Give me concrete findings with file:line and a suggested fix.\n\n${inline("02-labels-module")}`,
    practices: [
      "flags that the repository returns Drizzle $inferSelect row types (LabelRow and/or PullRow) to the service instead of mapping to contract types at the repository edge",
      "flags that LabelService.replace runs deleteForPull → insertMany → touchPull without a transaction, and says the service should open the transaction and pass tx to the repository methods",
      "flags that service.ts imports FastifyReply / sets reply.status, and says HTTP status mapping belongs in routes.ts",
      "does not report helpers.ts as an architecture violation (normalizeLabels is pure)",
    ],
    threshold: 0.75,
  },
  {
    name: "reviewer-core summarize: concrete LLM, fs I/O, db write in core",
    kind: "quality",
    prompt: `I added \`summarizeReview\` to reviewer-core so we get a one-paragraph summary after each review run. Before I export it from the reviewer-core barrel, can you check whether it fits how that package is supposed to be built? List problems with file:line and how to fix them.\n\n${inline("03-reviewer-core-summary")}`,
    practices: [
      "flags summarize.ts for importing/constructing OpenRouterProvider (with a process.env key) and says the LLMProvider must be injected via the input instead",
      "flags summarize.ts for reading the prompt from disk with node:fs and says the prompt should be passed in as a resolved string by the caller",
      "flags summarize.ts for writing to Postgres (agent_runs update) and says persistence belongs to the server caller (repository), not reviewer-core",
      "does not report format.ts as an architecture violation (it is pure)",
    ],
    threshold: 0.75,
  },
];
