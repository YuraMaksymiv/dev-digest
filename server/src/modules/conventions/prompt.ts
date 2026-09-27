import { z } from 'zod';
import { ConventionCategory } from '@devdigest/shared';
import { MAX_CANDIDATES } from './constants.js';

/**
 * The single model call of the extractor: a line-numbered listing in, a list
 * of proposed house rules out. Everything the model returns is a CLAIM —
 * `helpers.verifyCandidate` decides which claims survive.
 */

export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

/**
 * FIELD ORDER IS LOAD-BEARING. Structured output is generated left to right,
 * so a model that emits `category` first commits to a label before it has
 * written the rule it is labelling — and then writes a rule to fit the label.
 * Everything it OBSERVES (the rule, the citation, how often it saw it) comes
 * before everything it JUDGES (the category, the score).
 */
const ProposedConvention = z.object({
  /** One sentence, imperative, specific to this repo. */
  rule: z.string(),
  /** A path exactly as it appears in a `===== path =====` header. */
  evidence_path: z.string(),
  /** 1-based line number from the gutter. Verified — and corrected — in code. */
  evidence_line: z.number().int(),
  /** Lines copied verbatim from the listing, without the gutter. */
  evidence_snippet: z.string(),
  /** What a reviewer should flag when a diff breaks this rule. */
  rationale: z.string(),
  /** How many sampled files show this pattern. Grounds the score below. */
  occurrences: z.number().int(),
  category: ConventionCategory,
  confidence: z.number().min(0).max(1),
});

export const ConventionExtraction = z.object({
  conventions: z.array(ProposedConvention),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;
export type ProposedConvention = z.infer<typeof ProposedConvention>;

export const SYSTEM_PROMPT = `You are reading a sample of files from ONE repository, each rendered with a
1-based line-number gutter. Name the house conventions this repository ALREADY
follows, and prove each one with code from the listing.

A house convention is a choice THIS TEAM made that another competent team could
reasonably have made differently, and that this repository then applied
consistently. "Route handlers return a typed Result instead of throwing" is a
house convention. "Handle errors" is not.

For each convention:
- state it as one imperative sentence a reviewer could apply to a diff;
- cite ONE file path exactly as it appears in a "===== path =====" header;
- give the line number from the gutter, and copy the proving lines VERBATIM
  from the listing with the gutter removed;
- say what a reviewer should flag when a change breaks it;
- count how many sampled files show the pattern before you score it.

Do NOT return:
- universal engineering advice that would be true of any repository;
- anything a framework or language REQUIRES, which the team did not choose;
- anything a single trivial line would "prove" — a closing brace, an import of
  a well-known package, a blank export;
- a rule you cannot point at, or a preference with no observable pattern behind it;
- the same rule twice in different words.

Confidence: 0.90+ when nearly every relevant sampled file shows it; 0.70–0.89
for a clear majority; 0.50–0.69 for a handful of examples. Below 0.50, leave it
out entirely.

Return at most ${MAX_CANDIDATES} conventions, strongest first. Every citation is
checked against the file it names: a snippet that is not in the file it cites is
DISCARDED along with its rule, so copy, never paraphrase.`;

/** The user turn: just the listing, with a reminder of what it is. */
export function buildUserPrompt(repoFullName: string, sample: string): string {
  return `Repository: ${repoFullName}

Sampled files follow. Each begins with a "===== path =====" header, and every
line is prefixed with its 1-based line number and a pipe. The gutter is NOT part
of the file — strip it from any snippet you quote.

${sample}`;
}
