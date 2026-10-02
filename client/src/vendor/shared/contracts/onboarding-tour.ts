import { z } from 'zod';

/**
 * Onboarding Tour — one persisted document per repo (stored whole in the
 * `onboarding.json` jsonb column) plus the read/generate wire shapes and the
 * server-internal `TourFacts` boundary. Wire fields are snake_case.
 *
 * The whole `Tour` is re-parsed from jsonb, so fields added later MUST be
 * `.nullish()` (see server/INSIGHTS.md). Client code imports these as types only.
 */

export const TourMode = z.enum(['llm', 'skeleton']);
export type TourMode = z.infer<typeof TourMode>;

export const SkeletonReason = z.enum(['index_degraded', 'llm_unavailable', 'llm_failed']);
export type SkeletonReason = z.infer<typeof SkeletonReason>;

export const TourComplexity = z.enum(['low', 'medium', 'high']);
export type TourComplexity = z.infer<typeof TourComplexity>;

export const TourUsage = z.object({
  llm_calls: z.union([z.literal(0), z.literal(1)]),
  tokens_in: z.number(),
  tokens_out: z.number(),
  cost_usd: z.number().nullable(),
  model: z.string().nullable(),
  duration_ms: z.number(),
  dropped_items: z.number(),
});
export type TourUsage = z.infer<typeof TourUsage>;

export const TourIndexInfo = z.object({
  status: z.string(),
  reason: z.string().nullable(),
  files_indexed: z.number(),
  files_skipped: z.number(),
  files_total: z.number().nullable(),
  bounded: z.boolean(),
  hotness_available: z.boolean(),
});
export type TourIndexInfo = z.infer<typeof TourIndexInfo>;

export const Tour = z.object({
  repo_id: z.string(),
  generated_at: z.string(),
  source_sha: z.string(),
  mode: TourMode,
  skeleton_reason: SkeletonReason.nullish(),
  skeleton_detail: z.string().nullish(),
  index: TourIndexInfo,
  usage: TourUsage,
  architecture: z.object({
    summary_md: z.string().nullable(),
    diagram: z.string().nullable(),
    stack: z.array(z.object({ name: z.string(), evidence_path: z.string() })),
    structure: z.array(z.object({ path: z.string(), files: z.number() })),
    routes: z.array(z.object({ method: z.string(), path: z.string(), file: z.string() })),
  }),
  critical_paths: z
    .array(
      z.object({
        path: z.string(),
        reason: z.string().nullable(),
        computed_reason: z.string(),
      }),
    )
    .max(6),
  run_locally: z.array(
    z.object({
      command: z.string(),
      source_path: z.string(),
      note: z.string().nullable(),
    }),
  ),
  reading_path: z
    .array(
      z.object({
        path: z.string(),
        score: z.number(),
        pagerank: z.number(),
        hotness: z.number(),
        why: z.string().nullable(),
        computed_reason: z.string(),
      }),
    )
    .max(8),
  first_tasks: z
    .array(
      z.object({
        title: z.string(),
        path: z.string(),
        path_kind: z.enum(['file', 'dir']),
        complexity: TourComplexity,
      }),
    )
    .max(5),
  /** Set on a kept full tour when a regenerate attempt failed (AC-23). */
  last_attempt: z
    .object({
      at: z.string(),
      skeleton_reason: SkeletonReason,
      detail: z.string().nullable(),
      usage: TourUsage,
    })
    .nullish(),
});
export type Tour = z.infer<typeof Tour>;

export const OnboardingTourStatus = z.enum(['none', 'ready', 'not_cloned', 'generating']);
export type OnboardingTourStatus = z.infer<typeof OnboardingTourStatus>;

/** `GET /repos/:repoId/onboarding`. `index_sha` is the repo's current index commit. */
export const OnboardingTourResponse = z.object({
  status: OnboardingTourStatus,
  tour: Tour.nullish(),
  index_sha: z.string().nullable(),
});
export type OnboardingTourResponse = z.infer<typeof OnboardingTourResponse>;

/** Server-internal: deterministic facts handed from the repo-intel facade to the onboarding module. */
export const TourFacts = z.object({
  source_sha: z.string(),
  index: TourIndexInfo.extend({
    usable: z.boolean(),
    unusable_reason: z
      .enum(['no_data', 'failed', 'degraded', 'flag_off', 'no_ranked_files', 'sha_missing'])
      .nullable(),
    last_indexed_sha: z.string().nullable(),
  }),
  stack: z.array(z.object({ name: z.string(), evidence_path: z.string() })),
  structure: z.array(z.object({ path: z.string(), files: z.number() })),
  routes: z.array(z.object({ method: z.string(), path: z.string(), file: z.string() })),
  run_locally: z.array(z.object({ command: z.string(), source_path: z.string() })),
  critical_paths: z.array(z.object({ path: z.string(), computed_reason: z.string() })),
  reading_path: z.array(
    z.object({
      path: z.string(),
      score: z.number(),
      pagerank: z.number(),
      hotness: z.number(),
      computed_reason: z.string(),
    }),
  ),
  readme: z.object({ path: z.string(), text: z.string() }).nullable(),
});
export type TourFacts = z.infer<typeof TourFacts>;
