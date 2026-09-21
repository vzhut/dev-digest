import type { Skill, SkillStats, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from './repository.js';
import { MS_PER_DAY, PG_UNIQUE_VIOLATION, STATS_WINDOW_DAYS } from './constants.js';

/** Row → wire DTO (snake_case contract). */
export function toSkillDto(row: SkillRow, agentCount?: number): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    message: row.versionMessage ?? null,
    ...(agentCount === undefined ? {} : { agent_count: agentCount }),
  };
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    message: row.message ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** accepted / (accepted + dismissed); null (never 0) when nothing has a verdict. */
export function computeAcceptRate(accepted: number, dismissed: number): number | null {
  const verdicts = accepted + dismissed;
  return verdicts === 0 ? null : accepted / verdicts;
}

/** Start of the stats window (inclusive lower bound on `ran_at`). */
export function statsWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - STATS_WINDOW_DAYS * MS_PER_DAY);
}

/** True when a body edit must snapshot the old body + bump the version. */
export function bodyChanged(previous: string, next: string | undefined): boolean {
  return next !== undefined && next !== previous;
}

/** Detect a Postgres unique violation (postgres.js error, possibly wrapped in `cause`). */
export function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 3 && e && typeof e === 'object'; i++) {
    if ((e as { code?: string }).code === PG_UNIQUE_VIOLATION) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** True only for a clash on the (workspace, name) index — not any other unique constraint. */
export function isNameViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 3 && e && typeof e === 'object'; i++) {
    const { code, constraint_name: constraint } = e as { code?: string; constraint_name?: string };
    if (code === PG_UNIQUE_VIOLATION && constraint === 'skills_workspace_name_uq') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export type { SkillStats };
