import { z } from 'zod';

export const Severity = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export type Severity = z.infer<typeof Severity>;

export const Category = z.enum(['security', 'performance', 'correctness', 'style']);
export type Category = z.infer<typeof Category>;

export const Finding = z.object({
  id: z.string().uuid(),
  file: z.string().min(1),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  severity: Severity,
  category: Category,
  title: z.string().min(1).max(200),
  rationale: z.string().min(1),
  suggestion: z.string().nullable(),
}).refine((f) => f.end_line >= f.start_line, {
  message: 'end_line must be >= start_line',
  path: ['end_line'],
});
export type Finding = z.infer<typeof Finding>;

export const FindingsResponse = z.object({
  findings: z.array(Finding),
  total: z.number().int().nonnegative(),
});
export type FindingsResponse = z.infer<typeof FindingsResponse>;

export function parseFindingsResponse(input: unknown): FindingsResponse {
  return FindingsResponse.parse(input);
}
