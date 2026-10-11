import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import type { Finding, Review } from '@devdigest/shared';
import { OpenRouterProvider } from '../llm/openrouter.js';
import { formatFindingsForSummary } from './format.js';

export interface SummaryInput {
  runId: string;
  review: Review;
  model: string;
}

export interface SummaryOutcome {
  summary: string;
  tokensIn: number;
  tokensOut: number;
}

const PROMPT_PATH = join(process.cwd(), 'prompts', 'summary.md');

export async function summarizeReview(input: SummaryInput): Promise<SummaryOutcome> {
  const system = readFileSync(PROMPT_PATH, 'utf8');
  const llm = new OpenRouterProvider(process.env.OPENROUTER_API_KEY ?? '');

  const findings: Finding[] = input.review.findings ?? [];
  const result = await llm.complete({
    model: input.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: formatFindingsForSummary(findings) },
    ],
  });

  const sql = postgres(process.env.DATABASE_URL ?? '');
  try {
    await sql`update agent_runs set summary = ${result.text} where id = ${input.runId}`;
  } finally {
    await sql.end();
  }

  return { summary: result.text, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
}
