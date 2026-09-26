// Own Zod parsers for the parts of the DevDigest REST API this package reads — an
// anti-corruption layer, deliberately NOT imported from server/vendor/shared. Only consumed
// fields are declared (Zod strips the rest), so e.g. `Agent.system_prompt` / `output_schema`
// never enter this process.
//
// SYNC RULE: if a response of a consumed endpoint changes on the server, update this file
// (and its tests) in the same change. A mismatch fails loudly (see client.ts).
import { z } from 'zod';

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  provider: z.string(),
  model: z.string(),
  enabled: z.boolean(),
});
export type Agent = z.infer<typeof Agent>;

export const Repo = z.object({
  id: z.string(),
  full_name: z.string(),
});
export type Repo = z.infer<typeof Repo>;

/** One row of `GET /repos/:id/pulls`. `id` is the PR uuid the run/review routes take. */
export const PrMeta = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
  status: z.string().nullish(),
});
export type PrMeta = z.infer<typeof PrMeta>;

export const RunSummary = z.object({
  run_id: z.string(),
  agent_id: z.string().nullish(),
  agent_name: z.string().nullish(),
  status: z.string().nullish(), // running | done | failed | cancelled
  error: z.string().nullish(),
  cost_usd: z.number().nullish(),
  grounding: z.string().nullish(),
  ran_at: z.string().nullish(),
  score: z.number().nullish(),
  blockers: z.number().nullish(),
});
export type RunSummary = z.infer<typeof RunSummary>;

export const ActiveRun = z.object({
  run_id: z.string(),
  agent_id: z.string().nullish(),
  agent_name: z.string().nullish(),
  ran_at: z.string().nullish(),
});
export type ActiveRun = z.infer<typeof ActiveRun>;

export const FindingRecord = z.object({
  id: z.string(),
  severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string(),
  suggestion: z.string().nullish(),
  scope: z.string().nullish(),
  dismissed_at: z.string().nullish(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

export const ReviewRecord = z.object({
  id: z.string(),
  agent_id: z.string().nullish(),
  run_id: z.string().nullish(),
  agent_name: z.string().nullish(),
  kind: z.string().optional(),
  verdict: z.enum(['request_changes', 'approve', 'comment']).nullish(),
  summary: z.string().nullish(),
  score: z.number().nullish(),
  grounding: z.string().nullish(),
  cost_usd: z.number().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRecord),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

export const ConventionCandidate = z.object({
  id: z.string(),
  category: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_line_start: z.number().int(),
  evidence_line_end: z.number().int(),
  evidence_snippet: z.string(),
  evidence_url: z.string(),
  status: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

export const ConventionsResponse = z.object({
  scan: z.object({ sha: z.string() }).nullable(),
  candidates: z.array(ConventionCandidate),
});
export type ConventionsResponse = z.infer<typeof ConventionsResponse>;

/** `POST /pulls/:id/review` — only the created runs are read; the inline `reviews` are ignored. */
export const ReviewRunResponse = z.object({
  runs: z.array(z.object({ run_id: z.string(), agent_id: z.string(), agent_name: z.string() })),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

/** `GET /pulls/:id` is called only to prime the diff on the server; nothing is read from it. */
export const PullDetail = z.unknown();

/** API error envelope. `details` is intentionally not declared: it is never echoed. */
export const ApiErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
