import type {
  AgentEvalCase,
  AgentEvalCaseDetail,
  EvalCaseResultStatus,
  EvalFindingLink,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalSuiteTrendPoint,
} from '@devdigest/shared';
import type { EvalCaseRow, EvalRunRow } from '../../db/rows.js';
import type { EvalRunnableCase } from './ports.js';

/**
 * Pure row → DTO mappers for the eval module. A case row whose jsonb columns are missing
 * (legacy / hand-inserted rows) maps to null so the caller can skip it instead of crashing.
 */

export function toAgentEvalCase(
  row: EvalCaseRow,
  lastResult: EvalCaseResultStatus | undefined,
): AgentEvalCase | null {
  if (!row.agentId || !row.expectedOutput || !row.inputMeta) return null;
  return {
    id: row.id,
    agent_id: row.agentId,
    name: row.name,
    expectation: row.expectedOutput,
    meta: row.inputMeta,
    input_files: row.inputFiles ?? [],
    created_at: row.createdAt.toISOString(),
    last_result: lastResult ?? 'never_run',
  };
}

export function toAgentEvalCaseDetail(
  row: EvalCaseRow,
  lastResult: EvalCaseResultStatus | undefined,
): AgentEvalCaseDetail | null {
  const base = toAgentEvalCase(row, lastResult);
  return base ? { ...base, input_diff: row.inputDiff ?? '' } : null;
}

export function toFindingLink(link: {
  findingId: string;
  caseId: string;
  expectation: { type: EvalFindingLink['type'] } | null;
}): EvalFindingLink | null {
  if (!link.expectation) return null;
  return { finding_id: link.findingId, case_id: link.caseId, type: link.expectation.type };
}

/** A suite-level run row (status set) → list/summary DTO; legacy per-case rows map to null. */
export function toEvalSuiteRun(row: EvalRunRow): EvalSuiteRun | null {
  if (!row.status || !row.agentId) return null;
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_version: row.agentVersion,
    status: row.status,
    ran_at: row.ranAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
    cases_done: row.casesDone,
    traces_passed: row.tracesPassed,
    traces_total: row.tracesTotal,
    cases_errored: row.casesErrored,
    unlabeled: row.unlabeled,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    cost_usd: row.costUsd,
    cost_partial: row.costPartial,
    duration_ms: row.durationMs,
    error_reason: row.errorReason,
  };
}

/** Run detail: the summary plus the frozen config snapshot and stored per-case results. */
export function toEvalSuiteRunDetail(row: EvalRunRow): EvalSuiteRunDetail | null {
  const summary = toEvalSuiteRun(row);
  if (!summary) return null;
  return {
    ...summary,
    provider: row.provider ?? '',
    model: row.model ?? '',
    system_prompt: row.systemPrompt ?? '',
    strategy: row.strategy,
    skills: row.skills ?? [],
    case_ids: row.caseIds ?? [],
    results: row.results ?? [],
  };
}

export function toTrendPoint(run: EvalSuiteRun): EvalSuiteTrendPoint {
  return {
    run_id: run.id,
    ran_at: run.ran_at,
    recall: run.recall,
    precision: run.precision,
    citation_accuracy: run.citation_accuracy,
    traces_passed: run.traces_passed,
    traces_total: run.traces_total,
  };
}

/** The frozen input of a case row, or null for a row without expectation / meta (never run it). */
export function toRunnableCase(row: EvalCaseRow): EvalRunnableCase | null {
  if (!row.expectedOutput || !row.inputMeta) return null;
  return {
    id: row.id,
    name: row.name,
    inputDiff: row.inputDiff ?? '',
    expectation: row.expectedOutput,
    meta: row.inputMeta,
  };
}
