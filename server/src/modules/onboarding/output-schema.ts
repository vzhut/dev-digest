import { z } from 'zod';

/**
 * The ONE structured LLM output of an onboarding generation (spec → Boundary
 * contracts). The model writes prose only; the deterministic lists, their order
 * and their numbers come from the server and the merge step attaches this text
 * by path/command. Arrays are not `.max()`-bounded here: an over-long answer is
 * trimmed by the merge instead of failing the single, non-retried call.
 */
export const OnboardingLlmOutput = z.object({
  architecture_summary_md: z.string(),
  architecture_diagram: z.string().nullable(),
  critical_path_reasons: z.array(z.object({ path: z.string(), reason: z.string() })),
  reading_path_whys: z.array(z.object({ path: z.string(), why: z.string() })),
  command_notes: z.array(z.object({ command: z.string(), note: z.string() })),
  first_tasks: z.array(
    z.object({
      title: z.string(),
      path: z.string(),
      complexity: z.enum(['low', 'medium', 'high']),
    }),
  ),
});
export type OnboardingLlmOutput = z.infer<typeof OnboardingLlmOutput>;
