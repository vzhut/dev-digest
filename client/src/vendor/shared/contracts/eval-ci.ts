import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalRun, EvalOwnerKind, Conformance } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ---------------------------------------------------------------------------
// Eval pipeline — agent-owned cases frozen from decided findings, suite-level
// runs, compare and dashboards. ADDED next to the legacy per-case shapes above
// (nothing renamed); `traces_*` field names are kept on purpose, the UI says
// "cases". Fields persisted in jsonb (`expected_output`, `input_meta`,
// `results`, `skills`) that may be added later stay `.nullish()`.
// ---------------------------------------------------------------------------

export const EvalExpectationType = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationType = z.infer<typeof EvalExpectationType>;

/** Informational copy of the source finding's title/category/severity. */
export const EvalExpectationLabel = z.object({
  title: z.string(),
  category: z.string(),
  severity: z.string(),
});
export type EvalExpectationLabel = z.infer<typeof EvalExpectationLabel>;

/** Stored in `eval_cases.expected_output`. */
export const EvalExpectation = z.object({
  type: EvalExpectationType,
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  label: EvalExpectationLabel.nullish(),
});
export type EvalExpectation = z.infer<typeof EvalExpectation>;

/** Stored in `eval_cases.input_meta` — provenance frozen at creation. */
export const EvalCaseMeta = z.object({
  source_finding_id: z.string(),
  source_review_id: z.string(),
  source_run_id: z.string().nullish(),
  repo: z.string(),
  pr_number: z.number().int(),
  head_sha: z.string(),
  pr_title: z.string(),
  pr_body: z.string().nullish(),
});
export type EvalCaseMeta = z.infer<typeof EvalCaseMeta>;

export const EvalCaseLastResult = z.enum(['passed', 'failed', 'error', 'never_run']);
export type EvalCaseLastResult = z.infer<typeof EvalCaseLastResult>;

/** An agent-owned eval case as listed in the Evals tab. */
export const AgentEvalCase = z.object({
  id: z.string(),
  agent_id: z.string(),
  name: z.string(),
  expectation: EvalExpectation,
  meta: EvalCaseMeta,
  input_files: z.array(z.string()),
  created_at: z.string(),
  last_result: EvalCaseLastResult,
});
export type AgentEvalCase = z.infer<typeof AgentEvalCase>;

/** Case detail — adds the frozen single-file diff. */
export const AgentEvalCaseDetail = AgentEvalCase.extend({
  input_diff: z.string(),
});
export type AgentEvalCaseDetail = z.infer<typeof AgentEvalCaseDetail>;

/** `POST /findings/:id/eval-case` — 201 when created, 200 when it already existed. */
export const CreateEvalCaseResponse = z.object({
  case: AgentEvalCaseDetail,
  created: z.boolean(),
});
export type CreateEvalCaseResponse = z.infer<typeof CreateEvalCaseResponse>;

/** `GET /pulls/:id/eval-case-links` — which findings already have a case. */
export const EvalFindingLink = z.object({
  finding_id: z.string(),
  case_id: z.string(),
  type: EvalExpectationType,
});
export type EvalFindingLink = z.infer<typeof EvalFindingLink>;

export const EvalCaseResultStatus = z.enum(['passed', 'failed', 'error']);
export type EvalCaseResultStatus = z.infer<typeof EvalCaseResultStatus>;

/** How a produced finding or expectation is labelled in a case result. */
export const EvalOutcomeLabel = z.enum(['matched', 'missed', 'noise', 'unlabeled', 'dropped']);
export type EvalOutcomeLabel = z.infer<typeof EvalOutcomeLabel>;

/** A kept (grounded) finding the agent produced for a case. */
export const EvalProducedFinding = Finding;
export type EvalProducedFinding = z.infer<typeof EvalProducedFinding>;

export const EvalDroppedFinding = z.object({
  finding: Finding,
  reason: z.string(),
});
export type EvalDroppedFinding = z.infer<typeof EvalDroppedFinding>;

export const EvalExpectationOutcome = z.object({
  expectation: EvalExpectation,
  /** Indexes into `produced` of the findings that matched this expectation. */
  matched_by: z.array(z.number().int()),
});
export type EvalExpectationOutcome = z.infer<typeof EvalExpectationOutcome>;

/** Per-case result, persisted in `eval_runs.results` (survives case deletion). */
export const EvalCaseResult = z.object({
  case_id: z.string(),
  case_name: z.string().nullish(),
  status: EvalCaseResultStatus,
  error: z.string().nullish(),
  produced: z.array(EvalProducedFinding),
  dropped: z.array(EvalDroppedFinding),
  outcomes: z.array(EvalExpectationOutcome),
  /** Indexes into `produced` that matched a `must_not_flag` expectation. */
  noise: z.array(z.number().int()),
  /** Indexes into `produced` that matched no expectation at all. */
  unlabeled: z.array(z.number().int()),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int(),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

export const EvalSuiteRunStatus = z.enum(['running', 'completed', 'errored']);
export type EvalSuiteRunStatus = z.infer<typeof EvalSuiteRunStatus>;

export const EvalSkillRef = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().nullish(),
});
export type EvalSkillRef = z.infer<typeof EvalSkillRef>;

/** One suite-level run (all of an agent's cases) — the list/summary shape. */
export const EvalSuiteRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_version: z.number().int().nullable(),
  status: EvalSuiteRunStatus,
  ran_at: z.string(),
  finished_at: z.string().nullable(),
  cases_done: z.number().int(),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  cases_errored: z.number().int(),
  unlabeled: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  cost_usd: z.number().nullable(),
  cost_partial: z.boolean(),
  duration_ms: z.number().int().nullable(),
  error_reason: z.string().nullish(),
});
export type EvalSuiteRun = z.infer<typeof EvalSuiteRun>;

/** Run detail — adds the frozen config snapshot and per-case results. */
export const EvalSuiteRunDetail = EvalSuiteRun.extend({
  provider: z.string(),
  model: z.string(),
  system_prompt: z.string(),
  strategy: z.string().nullable(),
  skills: z.array(EvalSkillRef),
  case_ids: z.array(z.string()),
  results: z.array(EvalCaseResult),
});
export type EvalSuiteRunDetail = z.infer<typeof EvalSuiteRunDetail>;

/** `POST /agents/:id/eval-runs` — 202. */
export const StartEvalRunResponse = z.object({
  eval_run_id: z.string(),
  status: EvalSuiteRunStatus,
});
export type StartEvalRunResponse = z.infer<typeof StartEvalRunResponse>;

export const EvalMetricKey = z.enum(['recall', 'precision', 'citation_accuracy']);
export type EvalMetricKey = z.infer<typeof EvalMetricKey>;

export const EvalMetricDelta = z.object({
  metric: EvalMetricKey,
  old: z.number().nullable(),
  new: z.number().nullable(),
  /** new − old; null when either side is null. */
  delta: z.number().nullable(),
});
export type EvalMetricDelta = z.infer<typeof EvalMetricDelta>;

export const EvalLineDiffOp = z.enum(['same', 'add', 'del']);
export type EvalLineDiffOp = z.infer<typeof EvalLineDiffOp>;

export const EvalLineDiff = z.object({ op: EvalLineDiffOp, text: z.string() });
export type EvalLineDiff = z.infer<typeof EvalLineDiff>;

const EvalConfigChange = z.object({ old: z.string().nullable(), new: z.string().nullable() });

/** `GET /eval-runs/compare?a=&b=` — `old`/`new` are decided by `ran_at`. */
export const EvalRunCompare = z.object({
  old: EvalSuiteRunDetail,
  new: EvalSuiteRunDetail,
  same_config: z.boolean(),
  metrics: z.array(EvalMetricDelta),
  cost: z.object({
    old: z.number().nullable(),
    new: z.number().nullable(),
    partial: z.boolean(),
  }),
  passed: z.object({
    old: z.object({ passed: z.number().int(), total: z.number().int() }),
    new: z.object({ passed: z.number().int(), total: z.number().int() }),
  }),
  flipped_cases: z.array(
    z.object({
      case_id: z.string(),
      case_name: z.string().nullish(),
      old: EvalCaseResultStatus.nullable(),
      new: EvalCaseResultStatus.nullable(),
    }),
  ),
  config_diff: z.object({
    provider: EvalConfigChange.nullable(),
    model: EvalConfigChange.nullable(),
    strategy: EvalConfigChange.nullable(),
    /** Skills as `id@version` — present only when the two sets differ. */
    skills: z.object({ old: z.array(z.string()), new: z.array(z.string()) }).nullable(),
  }),
  prompt_diff: z.array(EvalLineDiff),
  case_set: z.object({
    common: z.number().int(),
    added: z.number().int(),
    removed: z.number().int(),
  }),
});
export type EvalRunCompare = z.infer<typeof EvalRunCompare>;

/** Trend point of a suite run — metrics may be null (errored / empty). */
export const EvalSuiteTrendPoint = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
});
export type EvalSuiteTrendPoint = z.infer<typeof EvalSuiteTrendPoint>;

/** Dashboard card — one agent that has at least one case. */
export const EvalAgentCard = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  model: z.string(),
  cases_total: z.number().int(),
  latest_run: EvalSuiteRun.nullable(),
  trend: z.array(EvalSuiteTrendPoint),
});
export type EvalAgentCard = z.infer<typeof EvalAgentCard>;

export const EvalRecentRun = EvalSuiteRun.extend({ agent_name: z.string() });
export type EvalRecentRun = z.infer<typeof EvalRecentRun>;

/** `GET /eval/dashboard`. */
export const EvalWorkspaceDashboard = z.object({
  cards: z.array(EvalAgentCard),
  recent_runs: z.array(EvalRecentRun),
});
export type EvalWorkspaceDashboard = z.infer<typeof EvalWorkspaceDashboard>;

export const EvalRegression = z.object({
  metric: EvalMetricKey,
  drop: z.number(),
});
export type EvalRegression = z.infer<typeof EvalRegression>;

/** `GET /agents/:id/eval-dashboard`. */
export const EvalAgentDashboard = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  model: z.string(),
  cases_total: z.number().int(),
  latest: EvalSuiteRun.nullable(),
  previous: EvalSuiteRun.nullable(),
  trend: z.array(EvalSuiteTrendPoint),
  runs: z.array(EvalSuiteRun),
  regression: z.array(EvalRegression),
});
export type EvalAgentDashboard = z.infer<typeof EvalAgentDashboard>;

/** `POST /eval/run-all` (optional). */
export const RunAllEvalResponse = z.object({
  started: z.array(z.string()),
  skipped: z.array(z.object({ agent_id: z.string(), reason: z.string() })),
});
export type RunAllEvalResponse = z.infer<typeof RunAllEvalResponse>;

export const EvalErrorCode = z.enum([
  'finding_not_triaged',
  'finding_has_no_agent',
  'diff_unavailable',
  'expectation_not_grounded',
  'eval_run_in_progress',
  'no_eval_cases',
  'compare_different_agents',
]);
export type EvalErrorCode = z.infer<typeof EvalErrorCode>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
