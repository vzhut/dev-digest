import type { Finding } from '@devdigest/shared';
import { CiResultArtifact } from '@devdigest/shared';
import { RunnerError } from './errors.js';

/** Runner version string embedded in every artifact (informational only). */
export const RUNNER_VERSION = '2';

export interface BuildResultArtifactInput {
  findings: Finding[];
  costUsd: number | null;
  durationMs: number;
  agent: string;
  prNumber: number;
  /** `owner/name`. */
  repository: string;
  repositoryId: number;
  headSha: string;
  /** Manifest fields echoed back so the studio can show what actually ran. */
  manifestVersion: number | null | undefined;
  model: string;
  skillVersions: Record<string, number> | null | undefined;
  /** `process.version` of the Node running the bundle. */
  nodeVersion: string;
  /** True when the deterministic gate requested changes. */
  gateTriggered: boolean;
  blockers: number;
}

function severityCounts(findings: Finding[]): { critical: number; warning: number; suggestion: number } {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.suggestion++;
  }
  return counts;
}

/**
 * Build + validate the `devdigest-result.json` artifact (AC-26). Validated
 * against the SAME `CiResultArtifact` Zod contract the studio's ingest path
 * (T6) will `safeParse` on the way back in, so a malformed artifact fails
 * loudly here rather than silently on ingest.
 */
export function buildResultArtifact(input: BuildResultArtifactInput): CiResultArtifact {
  const counts = severityCounts(input.findings);
  const candidate = {
    artifact_version: 2 as const,
    repository: input.repository,
    repository_id: input.repositoryId,
    head_sha: input.headSha,
    findings_count: input.findings.length,
    critical: counts.critical,
    warning: counts.warning,
    suggestion: counts.suggestion,
    cost_usd: input.costUsd,
    duration_ms: input.durationMs,
    agent: input.agent,
    version: RUNNER_VERSION,
    pr_number: input.prNumber,
    blockers: input.blockers,
    verdict: input.gateTriggered ? ('fail' as const) : ('pass' as const),
    manifest_version: input.manifestVersion ?? null,
    model: input.model,
    runner_version: RUNNER_VERSION,
    node_version: input.nodeVersion,
    skill_versions: input.skillVersions ?? null,
  };
  const result = CiResultArtifact.safeParse(candidate);
  if (!result.success) {
    // Should be unreachable — every field above is shaped to the schema. If
    // this ever fires it's a genuine internal bug, not a user/config error.
    throw new RunnerError(
      `Internal error: built result artifact failed CiResultArtifact validation: ${result.error.message}`,
    );
  }
  return result.data;
}
