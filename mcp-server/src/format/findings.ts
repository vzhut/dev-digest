// Pure findings helpers: filter / sort / limit, concise vs detailed mapping, run+review
// selection and the shared result builder used by get_findings and run_agent_on_pr.
// Inputs are the minimal wire shapes below (satisfied structurally by the parsed API types).
import {
  UNTRUSTED_NOTE,
  type ConciseFinding,
  type DetailedFinding,
  type FindingsResult,
  type ResponseFormat,
  type SeverityCounts,
  type SeverityName,
  type Verdict,
} from '../contracts.js';
import { limitWithHint } from './respond.js';
import { sanitizeText } from './sanitize.js';

export interface FindingInput {
  id: string;
  severity: SeverityName;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null | undefined;
  scope?: string | null | undefined;
  dismissed_at?: string | null | undefined;
  // `confidence` is deliberately absent: models sometimes store 0 for every finding.
}

export interface ReviewInput {
  id: string;
  agent_id?: string | null | undefined;
  agent_name?: string | null | undefined;
  run_id?: string | null | undefined;
  kind?: string | undefined;
  verdict?: Verdict | null | undefined;
  summary?: string | null | undefined;
  score?: number | null | undefined;
  grounding?: string | null | undefined;
  cost_usd?: number | null | undefined;
  created_at: string;
  findings: FindingInput[];
}

export interface RunInput {
  run_id: string;
  agent_id?: string | null | undefined;
  agent_name?: string | null | undefined;
  status?: string | null | undefined;
  error?: string | null | undefined;
  cost_usd?: number | null | undefined;
  grounding?: string | null | undefined;
  ran_at?: string | null | undefined;
  score?: number | null | undefined;
  blockers?: number | null | undefined;
}

/** Higher = more severe. */
export const SEVERITY_RANK: Record<SeverityName, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

const TITLE_MAX = 160;
const FILE_MAX = 200;
const RATIONALE_MAX = 1200;
const SUGGESTION_MAX = 800;
const SUMMARY_MAX = 600;

export function isActive(f: FindingInput): boolean {
  return !f.dismissed_at;
}

export function severityCounts(findings: readonly FindingInput[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (!isActive(f)) continue;
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.suggestion++;
  }
  return counts;
}

function compareFindings(a: FindingInput, b: FindingInput): number {
  return (
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
    a.file.localeCompare(b.file) ||
    a.start_line - b.start_line ||
    a.end_line - b.end_line
  );
}

function truncationHint(severityMin: SeverityName): (shown: number, total: number) => string {
  return (shown, total) => {
    const tail =
      severityMin === 'SUGGESTION' ? ' or set severity_min=WARNING' : severityMin === 'WARNING' ? ' or set severity_min=CRITICAL' : '';
    return `showing ${shown} of ${total} — raise limit (max 100)${tail}`;
  };
}

export interface FilterSortLimitOptions {
  severityMin: SeverityName;
  limit: number;
}

/** Drop dismissed + below-threshold findings, order by severity → file → line, take `limit`. */
export function filterSortLimit(findings: readonly FindingInput[], opts: FilterSortLimitOptions) {
  const min = SEVERITY_RANK[opts.severityMin];
  const kept = findings.filter((f) => isActive(f) && SEVERITY_RANK[f.severity] >= min).sort(compareFindings);
  return limitWithHint(kept, opts.limit, truncationHint(opts.severityMin));
}

export function toConciseFinding(f: FindingInput): ConciseFinding {
  return {
    severity: f.severity,
    title: sanitizeText(f.title, TITLE_MAX),
    where: `${sanitizeText(f.file, FILE_MAX)}:${f.start_line}-${f.end_line}`,
    category: f.category,
  };
}

export function toDetailedFinding(f: FindingInput): DetailedFinding {
  const out: DetailedFinding = {
    ...toConciseFinding(f),
    rationale: sanitizeText(f.rationale, RATIONALE_MAX, { multiline: true }),
    id: f.id,
  };
  if (f.suggestion) out.suggestion = sanitizeText(f.suggestion, SUGGESTION_MAX, { multiline: true });
  if (f.scope) out.scope = f.scope;
  return out;
}

/** `0/0` grounding on a review with no findings usually means the run saw an empty diff. */
export function emptyDiffWarning(grounding: string | null | undefined, total: number): string | undefined {
  if (total !== 0 || !grounding) return undefined;
  return /^\s*0\s*\/\s*0\b/.test(grounding) ? '0/0 grounded — the review may have run on an empty diff' : undefined;
}

// ---- Selecting the run + review to report on ----

export type PickedReview =
  | { state: 'no_run' }
  /** `run_id` was given but is not one of this PR's runs. */
  | { state: 'unknown_run' }
  /** Run still going — also used for a `done` run whose review is not visible yet (retry shortly). */
  | { state: 'running'; run: RunInput; alsoReviewedBy: string[] }
  | { state: 'failed'; run: RunInput; alsoReviewedBy: string[] }
  | { state: 'cancelled'; run: RunInput; alsoReviewedBy: string[] }
  | { state: 'done'; run?: RunInput; review: ReviewInput; alsoReviewedBy: string[] };

export interface PickOptions {
  runId?: string | undefined;
  agentId?: string | undefined;
}

function newestFirst<T>(items: readonly T[], key: (t: T) => string | null | undefined): T[] {
  return [...items].sort((a, b) => (key(b) ?? '').localeCompare(key(a) ?? ''));
}

/**
 * Join runs and reviews on `run_id` (never by index: runs sort by `ran_at`, reviews by
 * `created_at`). Precedence: explicit `runId` → latest run of `agentId` → latest run overall.
 * A PR with reviews but no run (seeded data) falls back to the latest review.
 */
export function pickReview(reviews: readonly ReviewInput[], runs: readonly RunInput[], opts: PickOptions = {}): PickedReview {
  const orderedRuns = newestFirst(runs, (r) => r.ran_at);

  let selected: RunInput | undefined;
  if (opts.runId) {
    selected = orderedRuns.find((r) => r.run_id === opts.runId);
    if (!selected) return { state: 'unknown_run' };
  } else {
    selected = orderedRuns.find((r) => !opts.agentId || r.agent_id === opts.agentId);
  }

  if (!selected) {
    // No run to report on. Seeded reviews carry no run_id: use the latest matching review.
    const pool = newestFirst(
      reviews.filter((r) => (!opts.agentId || r.agent_id === opts.agentId) && r.kind !== 'summary'),
      (r) => r.created_at,
    );
    const review = pool[0];
    if (opts.agentId && orderedRuns.length > 0) return { state: 'no_run' };
    return review ? { state: 'done', review, alsoReviewedBy: [] } : { state: 'no_run' };
  }

  const alsoReviewedBy = opts.runId || opts.agentId ? [] : otherAgents(orderedRuns, selected);

  const status = selected.status ?? 'running';
  if (status === 'failed') return { state: 'failed', run: selected, alsoReviewedBy };
  if (status === 'cancelled') return { state: 'cancelled', run: selected, alsoReviewedBy };
  if (status === 'done') {
    const review = newestFirst(
      reviews.filter((r) => r.run_id === selected.run_id && r.kind !== 'summary'),
      (r) => r.created_at,
    )[0];
    if (review) return { state: 'done', run: selected, review, alsoReviewedBy };
  }
  return { state: 'running', run: selected, alsoReviewedBy };
}

function otherAgents(runs: readonly RunInput[], selected: RunInput): string[] {
  const names = new Set<string>();
  for (const r of runs) {
    if (r.agent_id === selected.agent_id) continue;
    if (r.agent_name) names.add(r.agent_name);
  }
  return [...names];
}

// ---- Result builder ----

export interface BuildFindingsInput {
  repo: string;
  pr: number;
  review: ReviewInput;
  run?: RunInput | undefined;
  severityMin: SeverityName;
  limit: number;
  format: ResponseFormat;
  alsoReviewedBy?: readonly string[] | undefined;
}

/** The concise/detailed `done` result shared by get_findings and run_agent_on_pr. */
export function buildFindingsResult(input: BuildFindingsInput): FindingsResult {
  const { review, run } = input;
  const page = filterSortLimit(review.findings, { severityMin: input.severityMin, limit: input.limit });
  const counts = severityCounts(review.findings);
  const activeTotal = counts.critical + counts.warning + counts.suggestion;
  const grounding = review.grounding ?? run?.grounding;

  const hints: string[] = [];
  if (page.hint) hints.push(page.hint);
  if (input.alsoReviewedBy && input.alsoReviewedBy.length > 0) {
    hints.push(`also reviewed by: ${input.alsoReviewedBy.join(', ')} — pass agent`);
  }

  const result: FindingsResult = {
    status: 'done',
    repo: input.repo,
    pr: input.pr,
    counts,
    findings: page.items.map(input.format === 'detailed' ? toDetailedFinding : toConciseFinding),
    shown: page.shown,
    total: page.total,
    untrusted: UNTRUSTED_NOTE,
  };
  const agent = review.agent_name ?? run?.agent_name;
  if (agent) result.agent = sanitizeText(agent, 80);
  const runId = run?.run_id ?? review.run_id;
  if (runId) result.run_id = runId;
  if (review.verdict) result.verdict = review.verdict;
  const score = review.score ?? run?.score;
  if (score !== null && score !== undefined) result.score = score;
  if (run?.blockers !== null && run?.blockers !== undefined) result.blockers = run.blockers;
  const cost = run?.cost_usd ?? review.cost_usd;
  if (cost !== null && cost !== undefined) result.cost_usd = cost;
  if (input.format === 'detailed' && review.summary) result.summary = sanitizeText(review.summary, SUMMARY_MAX, { multiline: true });
  if (hints.length > 0) result.hint = hints.join('; ');
  const warning = emptyDiffWarning(grounding, activeTotal);
  if (warning) result.warning = warning;
  return result;
}
