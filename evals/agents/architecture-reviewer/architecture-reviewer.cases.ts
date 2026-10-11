import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const REVIEW_PROMPT = `Review this diff for architecture-boundary violations. The bash tool is unavailable in this session, so skip \`pnpm --dir server arch\` and review manually against the rule set.

${fx("checkout-service.diff")}`;

const BENIGN_PROMPT = `Review this diff for architecture-boundary violations. The bash tool is unavailable in this session, so skip \`pnpm --dir server arch\` and review manually against the rule set.

${fx("benign-refactor.diff")}`;

// Both A/B versions of the agent run these exact cases; the rule-name practice is the one the
// "cite a rule name" line in the agent definition is responsible for.
export const cases: AgentCase[] = [
  {
    name: "flags both checkout violations, each citing a named rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags checkout.ts (a domain file) importing FastifyReply from 'fastify' as a violation — Fastify must stay at the transport edge",
      "flags `new PgCheckoutRepository()` inside service.ts as a violation — concretes may only be constructed in the composition root (platform/container.ts)",
      "names a concrete rule identifier from server/.dependency-cruiser.cjs (e.g. `fastify-stays-at-the-edge`, `concretes-only-in-composition-root`) for EVERY finding, not only a prose description",
      "assigns a severity to each finding",
    ],
    threshold: 0.75,
    maxTurns: 20,
  },
  {
    name: "does not fabricate a violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no architecture violations for the diff (an empty findings table or only non-blocking info notes)",
      "does not invent a rule violation where the diff introduces no new imports or cross-layer edges",
    ],
    threshold: 1.0,
    maxTurns: 20,
  },
];
