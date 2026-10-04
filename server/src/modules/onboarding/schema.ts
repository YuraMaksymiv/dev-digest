import { z } from 'zod';

/**
 * Server-internal LLM output. Deliberately a subset of `OnboardingTour`: the
 * order and `score` of the reading path are computed in code, so the model only
 * contributes prose. No length keywords here (strict JSON-schema providers
 * reject some); limits are enforced in `validateLlmTour`.
 */
export const LlmTour = z.object({
  architecture: z.object({
    summary_md: z.string(),
    diagram: z.string().nullable(),
  }),
  critical_paths: z.array(z.object({ path: z.string(), reason: z.string() })),
  run_steps: z.array(z.object({ command: z.string(), note: z.string() })),
  reading_path: z.array(z.object({ path: z.string(), why: z.string() })),
  first_tasks: z.array(
    z.object({ title: z.string(), why: z.string(), files: z.array(z.string()) }),
  ),
});
export type LlmTour = z.infer<typeof LlmTour>;
