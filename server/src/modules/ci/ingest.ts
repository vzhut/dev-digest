import { unzipSync } from 'fflate';
import { CiResultArtifact, type CiRunItem, type CiWorkflowRun } from '@devdigest/shared';
import { z } from 'zod';
import {
  CI_EXPORTABLE_PROVIDER,
  CI_FAILED_CONCLUSIONS,
  CI_MAX_ARTIFACT_BYTES,
  CI_RESULT_FILE,
  CI_WORKFLOW_PATH,
} from './constants.js';

/**
 * Pure ingest logic: verify a workflow run and its result artifact, map them to
 * `agent_runs` / `run_traces` values and back to the list DTO. No Drizzle,
 * Fastify or SDK. The artifact comes from CI (untrusted): everything in it is
 * data, validated here before anything is stored.
 */

export type RunStatus = 'done' | 'failed' | 'skipped';

/** Why a run or artifact was rejected (logged; never the artifact body). */
export type RejectReason =
  | 'workflow_path_mismatch'
  | 'artifact_too_large'
  | 'unzip_failed'
  | 'result_file_missing'
  | 'result_too_large'
  | 'json_invalid'
  | 'schema_invalid'
  | 'repository_mismatch'
  | 'sha_mismatch';

export type ParsedArtifact =
  | { ok: true; artifact: CiResultArtifact }
  | { ok: false; reason: RejectReason };

/** Run key used for idempotency: one entry per run attempt. */
export function ciRunKey(run: Pick<CiWorkflowRun, 'id' | 'run_attempt'>): string {
  return `${run.id}:${run.run_attempt}`;
}

/** Only completed runs of the devdigest workflow file are ever looked at. */
export function runPathRejection(run: Pick<CiWorkflowRun, 'path'>): RejectReason | null {
  return run.path === CI_WORKFLOW_PATH ? null : 'workflow_path_mismatch';
}

export function isCompleted(run: Pick<CiWorkflowRun, 'status'>): boolean {
  return run.status === 'completed';
}

/** Zip bytes -> validated artifact. Bounded on both the zip and the unzipped JSON. */
export function parseArtifactZip(zip: Uint8Array): ParsedArtifact {
  if (zip.byteLength > CI_MAX_ARTIFACT_BYTES) return { ok: false, reason: 'artifact_too_large' };
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, {
      // Skip every other entry and refuse an oversized one before inflating it.
      filter: (f) => f.name === CI_RESULT_FILE && f.originalSize <= CI_MAX_ARTIFACT_BYTES,
    });
  } catch {
    return { ok: false, reason: 'unzip_failed' };
  }
  const raw = files[CI_RESULT_FILE];
  if (!raw) return { ok: false, reason: 'result_file_missing' };
  if (raw.byteLength > CI_MAX_ARTIFACT_BYTES) return { ok: false, reason: 'result_too_large' };
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    return { ok: false, reason: 'json_invalid' };
  }
  const parsed = CiResultArtifact.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'schema_invalid' };
  return { ok: true, artifact: parsed.data };
}

/** The artifact must belong to the run GitHub reports: same repository id and commit. */
export function verifyArtifact(
  artifact: Pick<CiResultArtifact, 'repository_id' | 'head_sha'>,
  run: Pick<CiWorkflowRun, 'repository_id' | 'head_sha'>,
): RejectReason | null {
  if (artifact.repository_id !== run.repository_id) return 'repository_mismatch';
  if (artifact.head_sha !== run.head_sha) return 'sha_mismatch';
  return null;
}

/** `failed` for a run that did not finish well, otherwise `skipped`. */
export function noArtifactStatus(run: Pick<CiWorkflowRun, 'conclusion'>): RunStatus {
  return (CI_FAILED_CONCLUSIONS as readonly string[]).includes(run.conclusion ?? '')
    ? 'failed'
    : 'skipped';
}

/** The `run_traces.trace` document of a CI run. */
export interface CiTrace {
  source: 'ci';
  ci_run_key: string;
  repo: string;
  pr_number: number | null;
  pr_url: string | null;
  commit_sha: string;
  job_url: string;
  agent_name: string;
  manifest_version: number | null;
  model: string | null;
  verdict: 'pass' | 'fail' | null;
  critical: number | null;
  warning: number | null;
  suggestion: number | null;
  dependencies: {
    runner_version: string | null;
    node_version: string | null;
    skill_versions: Record<string, number>;
  };
}

/** Values for an `agent_runs` row (the repository leaves the PR link null). */
export interface CiRunValues {
  workspaceId: string;
  agentId: string;
  ranAt: Date;
  provider: string;
  model: string | null;
  durationMs: number | null;
  costUsd: number | null;
  status: RunStatus;
  error: string | null;
  findingsCount: number | null;
  blockers: number | null;
}

export interface CiRunRecord {
  run: CiRunValues;
  trace: CiTrace;
}

export interface RecordContext {
  workspaceId: string;
  agentId: string;
  agentName: string;
  repo: string;
}

function prUrlOf(repo: string, prNumber: number | null): string | null {
  return prNumber === null ? null : `https://github.com/${repo}/pull/${prNumber}`;
}

/** Map a verified run (+ its artifact, when there is one) to the rows to store. */
export function toCiRunRecord(
  ctx: RecordContext,
  run: CiWorkflowRun,
  artifact: CiResultArtifact | null,
): CiRunRecord {
  const prNumber = artifact?.pr_number ?? null;
  const status: RunStatus = artifact ? 'done' : noArtifactStatus(run);
  return {
    run: {
      workspaceId: ctx.workspaceId,
      agentId: ctx.agentId,
      ranAt: new Date(run.updated_at),
      provider: CI_EXPORTABLE_PROVIDER,
      model: artifact?.model ?? null,
      durationMs: artifact?.duration_ms ?? null,
      costUsd: artifact?.cost_usd ?? null,
      status,
      error: artifact ? null : 'no result artifact',
      findingsCount: artifact?.findings_count ?? null,
      blockers: artifact?.blockers ?? null,
    },
    trace: {
      source: 'ci',
      ci_run_key: ciRunKey(run),
      repo: ctx.repo,
      pr_number: prNumber,
      pr_url: prUrlOf(ctx.repo, prNumber),
      commit_sha: run.head_sha,
      job_url: run.html_url,
      agent_name: ctx.agentName,
      manifest_version: artifact?.manifest_version ?? null,
      model: artifact?.model ?? null,
      verdict: artifact?.verdict ?? null,
      critical: artifact?.critical ?? null,
      warning: artifact?.warning ?? null,
      suggestion: artifact?.suggestion ?? null,
      dependencies: {
        runner_version: artifact?.runner_version ?? null,
        node_version: artifact?.node_version ?? null,
        skill_versions: artifact?.skill_versions ?? {},
      },
    },
  };
}

/** What `listCiRuns` hands over per row: the run columns and the trace jsonb. */
export interface CiRunRow {
  id: string;
  agentId: string | null;
  ranAt: Date;
  status: string | null;
  blockers: number | null;
  findingsCount: number | null;
  costUsd: number | null;
  durationMs: number | null;
  trace: unknown;
}

const TraceView = z
  .object({
    repo: z.string(),
    agent_name: z.string(),
    job_url: z.string(),
    pr_number: z.number().int().nullish(),
    pr_url: z.string().nullish(),
    commit_sha: z.string().nullish(),
    verdict: z.enum(['pass', 'fail']).nullish(),
    critical: z.number().int().nullish(),
    warning: z.number().int().nullish(),
    suggestion: z.number().int().nullish(),
  })
  .passthrough();

const RUN_STATUSES: readonly string[] = ['done', 'failed', 'skipped'];

/** Row -> list DTO; null when the row is not a well-formed CI run. */
export function toCiRunItem(row: CiRunRow): CiRunItem | null {
  const t = TraceView.safeParse(row.trace);
  if (!t.success || !row.status || !RUN_STATUSES.includes(row.status)) return null;
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_name: t.data.agent_name,
    repo: t.data.repo,
    pr_number: t.data.pr_number ?? null,
    pr_url: t.data.pr_url ?? null,
    commit_sha: t.data.commit_sha ?? null,
    status: row.status as RunStatus,
    verdict: t.data.verdict ?? null,
    blockers: row.blockers,
    findings_count: row.findingsCount,
    critical: t.data.critical ?? null,
    warning: t.data.warning ?? null,
    suggestion: t.data.suggestion ?? null,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    ran_at: row.ranAt.toISOString(),
    job_url: t.data.job_url,
  };
}
