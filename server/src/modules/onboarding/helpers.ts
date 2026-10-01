/**
 * Pure helpers for the onboarding module (no DB / network / FS): merging the
 * model's text onto the deterministic lists, the deterministic skeleton, index
 * classification, the AC-28 log line and secret redaction of failure details.
 */
import type { SkeletonReason, Tour, TourFacts, TourMode, TourUsage } from '@devdigest/shared';
import { redactSecrets } from '../_shared/redact.js';
import { FIRST_TASKS_MAX, MAX_DETAIL_CHARS, MAX_NOTE_CHARS, MAX_TASK_TITLE_CHARS } from './constants.js';
import type { OnboardingLlmOutput } from './output-schema.js';

/** Everything of a `Tour` that generation decides; the service adds identity, timing and usage. */
export interface TourBody {
  architecture: Tour['architecture'];
  critical_paths: Tour['critical_paths'];
  run_locally: Tour['run_locally'];
  reading_path: Tour['reading_path'];
  first_tasks: Tour['first_tasks'];
}

export interface MergedTourBody extends TourBody {
  /** Model items discarded because they were not grounded in the facts / clone (AC-17). */
  dropped_items: number;
}

export interface SkeletonTourBody extends TourBody {
  mode: Extract<TourMode, 'skeleton'>;
  skeleton_reason: SkeletonReason;
  skeleton_detail: string | null;
  index: Tour['index'];
}

export type PathKinds = ReadonlyMap<string, 'file' | 'dir'>;

// ---- redaction -------------------------------------------------------------

/** Short, single-line, secret-free text for `skeleton_detail` / `last_attempt.detail` / logs. */
export function redactDetail(msg: string): string {
  return redactSecrets(msg)
    .replace(/\b(api[_-]?key|access[_-]?token|secret|password)\b\s*[:=]\s*\S+/gi, '$1=***')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DETAIL_CHARS);
}

// ---- merge (AC-16, AC-17) --------------------------------------------------

const normPath = (p: string): string => p.trim().replace(/^\.\//, '').replace(/\/+$/, '');

const cleanText = (s: string, max: number): string | null => {
  const t = s.trim().slice(0, max);
  return t.length > 0 ? t : null;
};

function cleanDiagram(d: string | null): string | null {
  if (d === null) return null;
  const t = d.replace(/^\s*```(?:mermaid)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  return t.length > 0 ? t : null;
}

/**
 * Attach the model's text to the deterministic items by path / command. The lists
 * and their order are never taken from the model; every model item that does not
 * match a given item (or a first task whose path is neither file nor directory)
 * is dropped and counted.
 */
export function mergeModelOutput(facts: TourFacts, output: OnboardingLlmOutput, pathKinds: PathKinds): MergedTourBody {
  let dropped = 0;

  const attach = (items: Array<{ key: string; text: string }>, valid: Set<string>) => {
    const byKey = new Map<string, string>();
    for (const it of items) {
      const text = cleanText(it.text, MAX_NOTE_CHARS);
      if (!valid.has(it.key) || byKey.has(it.key) || text === null) {
        dropped += 1;
        continue;
      }
      byKey.set(it.key, text);
    }
    return byKey;
  };

  const reasons = attach(
    output.critical_path_reasons.map((r) => ({ key: normPath(r.path), text: r.reason })),
    new Set(facts.critical_paths.map((c) => c.path)),
  );
  const whys = attach(
    output.reading_path_whys.map((r) => ({ key: normPath(r.path), text: r.why })),
    new Set(facts.reading_path.map((r) => r.path)),
  );
  const notes = attach(
    output.command_notes.map((n) => ({ key: n.command.trim(), text: n.note })),
    new Set(facts.run_locally.map((c) => c.command)),
  );

  const first_tasks: Tour['first_tasks'] = [];
  for (const t of output.first_tasks) {
    const path = normPath(t.path);
    const kind = pathKinds.get(path);
    const title = cleanText(t.title, MAX_TASK_TITLE_CHARS);
    if (!kind || title === null || first_tasks.length >= FIRST_TASKS_MAX) {
      dropped += 1;
      continue;
    }
    first_tasks.push({ title, path, path_kind: kind, complexity: t.complexity });
  }

  return {
    architecture: {
      summary_md: cleanText(output.architecture_summary_md, Number.MAX_SAFE_INTEGER),
      diagram: cleanDiagram(output.architecture_diagram),
      stack: facts.stack,
      structure: facts.structure,
      routes: facts.routes,
    },
    critical_paths: facts.critical_paths.map((c) => ({
      path: c.path,
      reason: reasons.get(c.path) ?? null,
      computed_reason: c.computed_reason,
    })),
    run_locally: facts.run_locally.map((c) => ({
      command: c.command,
      source_path: c.source_path,
      note: notes.get(c.command) ?? null,
    })),
    reading_path: facts.reading_path.map((r) => ({
      path: r.path,
      score: r.score,
      pagerank: r.pagerank,
      hotness: r.hotness,
      why: whys.get(r.path) ?? null,
      computed_reason: r.computed_reason,
    })),
    first_tasks,
    dropped_items: dropped,
  };
}

// ---- skeleton (AC-19, AC-21) -----------------------------------------------

/** Deterministic tour content only: no prose, no model-looking text, no first tasks. */
export function buildSkeleton(facts: TourFacts, reason: SkeletonReason, detail: string | null): SkeletonTourBody {
  const { status, reason: indexReason, files_indexed, files_skipped, files_total, bounded, hotness_available } = facts.index;
  return {
    mode: 'skeleton',
    skeleton_reason: reason,
    skeleton_detail: detail === null ? null : redactDetail(detail),
    index: { status, reason: indexReason, files_indexed, files_skipped, files_total, bounded, hotness_available },
    architecture: {
      summary_md: null,
      diagram: null,
      stack: facts.stack,
      structure: facts.structure,
      routes: facts.routes,
    },
    critical_paths: facts.critical_paths.map((c) => ({ path: c.path, reason: null, computed_reason: c.computed_reason })),
    run_locally: facts.run_locally.map((c) => ({ command: c.command, source_path: c.source_path, note: null })),
    reading_path: facts.reading_path.map((r) => ({ ...r, why: null })),
    first_tasks: [],
  };
}

// ---- index usability (AC-19) -----------------------------------------------

export interface IndexSignals {
  /** The repo-intel feature flag. */
  flagEnabled: boolean;
  /** `repo_index_state.status`, or null when the repo was never indexed. */
  status: string | null;
  rankedFiles: number;
  /** The index's last indexed commit, null/empty when unknown. */
  indexedSha: string | null;
  /** Whether that commit is present in the clone (a depth-1 clone may not have it). */
  shaInClone: boolean;
}

export interface IndexClass {
  usable: boolean;
  unusable_reason: TourFacts['index']['unusable_reason'];
}

/** Why an index cannot ground a tour, in precedence order; `usable` when nothing does. */
export function classifyIndex(s: IndexSignals): IndexClass {
  const no = (unusable_reason: NonNullable<IndexClass['unusable_reason']>): IndexClass => ({ usable: false, unusable_reason });
  if (!s.flagEnabled) return no('flag_off');
  if (s.status === null) return no('no_data');
  if (s.status === 'failed') return no('failed');
  if (s.status === 'degraded') return no('degraded');
  if (!s.indexedSha || !s.shaInClone) return no('sha_missing');
  if (s.rankedFiles <= 0) return no('no_ranked_files');
  return { usable: true, unusable_reason: null };
}

// ---- log line (AC-28) + last attempt (AC-23) --------------------------------

export interface GeneratedLogInput {
  owner: string;
  name: string;
  mode: TourMode;
  skeletonReason: SkeletonReason | null | undefined;
  usage: TourUsage;
}

/** The one `onboarding: generated …` line. Counts and identifiers only, never repo text. */
export function formatGeneratedLog(i: GeneratedLogInput): string {
  const u = i.usage;
  const cost = u.cost_usd === null ? 'unknown' : `$${u.cost_usd.toFixed(6)}`;
  return (
    `onboarding: generated ${i.owner}/${i.name} mode=${i.mode} reason=${i.skeletonReason ?? 'none'} ` +
    `llm_calls=${u.llm_calls} tokens=${u.tokens_in}/${u.tokens_out} cost=${cost} ` +
    `model=${u.model ?? 'none'} duration_ms=${u.duration_ms} dropped=${u.dropped_items}`
  );
}

/** The `last_attempt` stored on a kept full tour when a regenerate ended in a skeleton. */
export function toLastAttempt(
  at: string,
  reason: SkeletonReason,
  detail: string | null,
  usage: TourUsage,
): NonNullable<Tour['last_attempt']> {
  return { at, skeleton_reason: reason, detail: detail === null ? null : redactDetail(detail), usage };
}
