import type { SkillCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const numbered = (src: string) =>
  src
    .split("\n")
    .map((l, i) => `${String(i + 1).padStart(3)}  ${l}`)
    .join("\n");

// Practices that the raw model also passed in the with/without benchmark (query coercion, the
// Severity enum pair, refine path, z.infer usage) were dropped: they measure Haiku, not the skill.
export const cases: SkillCase[] = [
  {
    name: "pull filters route: per-request schema, throwing refine, untrusted JSON",
    kind: "quality",
    prompt: `Review the Zod usage in this Fastify route file (server/src/modules/pulls/filters.routes.ts). For each problem give the line, what goes wrong at runtime, the fix, and the name of the guideline you are applying.\n\n${numbered(fx("pull-filters.routes.ts"))}`,
    practices: [
      "flags that the Query schema is constructed inside the request handler on every request and says to hoist it to module scope so it is built once",
      "flags that the refine callback throws an Error instead of returning false (a thrown error escapes safeParse as an exception rather than a validation issue), and says to return a boolean with a message/path",
      "flags that JSON.parse(raw) is cast with `as WebhookPayload` without validation and says to define a Zod schema for the webhook payload and parse it (safeParse) before use",
      "names at least two guidelines by this skill's rule identifiers (e.g. schema-coercion-for-form-data, perf-avoid-dynamic-creation, error-avoid-throwing-in-refine, parse-never-trust-json)",
    ],
    threshold: 0.65,
  },
  {
    name: "negative: a conforming schema file gets no fabricated findings",
    kind: "quality",
    prompt: `Quick Zod check before I merge — anything that needs to change in this contract file (server/src/vendor/shared/finding.ts)? If it is fine, just say so.\n\n${numbered(fx("finding.schema.ts"))}`,
    practices: [
      "concludes the file is fine / needs no required changes, rather than presenting a list of defects that must be fixed",
    ],
    threshold: 0.65,
  },
];
