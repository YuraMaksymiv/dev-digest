import { z } from 'zod';

// Loose on purpose: only the fields the MCP server reads are declared, so the
// API can add fields without breaking this client.

const Severity = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);

export const AgentsResponse = z.array(
  z.looseObject({
    id: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    enabled: z.boolean(),
  }),
);

export const ReposResponse = z.array(z.looseObject({ id: z.string(), full_name: z.string() }));

export const PrRefResponse = z.looseObject({
  pr_id: z.string(),
  repo: z.string(),
  number: z.number(),
  title: z.string(),
});

export const StartReviewResponse = z.looseObject({
  runs: z.array(z.looseObject({ run_id: z.string(), agent_id: z.string(), agent_name: z.string() })).min(1),
});

export const RunDetailResponse = z.looseObject({
  run_id: z.string(),
  status: z.enum(['running', 'done', 'failed', 'cancelled']),
  agent_name: z.string().nullish(),
  pr_id: z.string(),
  pr_number: z.number(),
  repo: z.string(),
  duration_ms: z.number().nullish(),
  findings_count: z.number().nullish(),
  score: z.number().nullish(),
  error: z.string().nullish(),
});

export const ReviewsResponse = z.array(
  z.looseObject({
    run_id: z.string().nullable(),
    kind: z.string(),
    verdict: z.string().nullish(),
    summary: z.string().nullish(),
    score: z.number().nullish(),
    findings: z.array(
      z.looseObject({
        id: z.string(),
        severity: Severity,
        category: z.string(),
        title: z.string(),
        file: z.string(),
        start_line: z.number(),
        end_line: z.number(),
        rationale: z.string(),
        suggestion: z.string().nullish(),
      }),
    ),
  }),
);

export const ConventionsResponse = z.array(
  z.looseObject({
    category: z.string(),
    rule: z.string(),
    confidence: z.number(),
    status: z.string(),
  }),
);

export const BlastRadiusResponse = z.looseObject({
  changed_symbols: z.array(z.looseObject({})),
  downstream: z.array(z.looseObject({})),
  summary: z.string(),
  degraded: z.boolean().optional(),
  reason: z.string().optional(),
});

export const SseEventData = z.looseObject({ msg: z.string().optional() });

export const ErrorBody = z.looseObject({
  message: z.string().optional(),
  error: z.union([z.string(), z.looseObject({ message: z.string().optional() })]).optional(),
});
