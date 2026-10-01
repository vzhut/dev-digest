/**
 * blast — pure mapping from the repo-intel facade's flat `BlastResult` to the wire
 * `BlastRadius` contract. No I/O, no LLM (spec D5): the summary is built from numbers.
 */
import type {
  BlastCaller,
  BlastDegradedReason,
  BlastRadius,
  BlastStats,
  DownstreamImpact,
  PrHistory,
} from '@devdigest/shared';
import type { BlastCallerRow, BlastResult, IndexState } from '../repo-intel/types.js';
import type { PriorPr } from '../../adapters/github/history.js';
import { HISTORY_MAX_ITEMS } from './constants.js';

export type BlastIndexState = Pick<IndexState, 'status' | 'lastIndexedSha' | 'degradedReason'>;

const sortedUnique = (values: Iterable<string>): string[] => [...new Set(values)].sort();

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Sort key: rank desc, then file, then line — deterministic. */
const byRank = (a: BlastCallerRow, b: BlastCallerRow): number =>
  b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line;

/** Summary from numbers only. Examples in specs/blast-radius.tasks.md (Design rule 7). */
export function buildSummary(
  stats: BlastStats,
  degraded: boolean,
  reason: BlastDegradedReason | null,
): string {
  let text: string;
  if (stats.symbols_changed === 0) {
    text = 'No indexed symbols in the changed files.';
  } else if (stats.symbols_affected === 0) {
    text = `None of ${stats.symbols_changed} changed ${stats.symbols_changed === 1 ? 'symbol' : 'symbols'} has callers in the indexed code.`;
  } else {
    text =
      `${stats.symbols_affected} of ${plural(stats.symbols_changed, 'changed symbol')} have callers: ` +
      `${plural(stats.callers, 'caller')}, ${plural(stats.endpoints, 'endpoint')}, ${plural(stats.crons, 'cron')}.`;
  }
  if (degraded) text += ` Index incomplete (${reason ?? 'unknown'}).`;
  return text;
}

/** Reason the map may be incomplete, merging the facade result with the index state (trap 2). */
function mergeReason(result: BlastResult, state: BlastIndexState): BlastDegradedReason | null {
  if (result.reason) return result.reason;
  switch (state.status) {
    case 'partial':
      return 'index_partial';
    case 'failed':
      return 'index_failed';
    case 'degraded':
      return state.degradedReason ?? 'no_data';
    default:
      return null;
  }
}

export function toBlastRadius(result: BlastResult, state: BlastIndexState): BlastRadius {
  // Files declaring each changed symbol name (a name can be declared in two changed files).
  const declFiles = new Map<string, string[]>();
  for (const s of result.changedSymbols) {
    const files = declFiles.get(s.name);
    if (!files) declFiles.set(s.name, [s.file]);
    else if (!files.includes(s.file)) files.push(s.file);
  }

  // 1. Group by symbol, dropping any caller that lives in a declaring file (P2.5).
  const groups = new Map<string, BlastCallerRow[]>();
  for (const c of result.callers) {
    if (declFiles.get(c.viaSymbol)?.includes(c.file)) continue;
    const g = groups.get(c.viaSymbol);
    if (g) g.push(c);
    else groups.set(c.viaSymbol, [c]);
  }

  const attributable = result.factsByFile !== undefined;
  const entries = [...groups.entries()].map(([symbol, rows]) => {
    rows.sort(byRank); // 2. within a group
    const callersTotal = Math.max(result.callerTotals?.[symbol] ?? rows.length, rows.length);
    const files = sortedUnique(rows.map((r) => r.file));
    // 3. endpoints/crons only from precomputed per-file facts — never invented (trap 4).
    const endpoints = attributable
      ? sortedUnique(files.flatMap((f) => result.factsByFile?.[f]?.endpoints ?? []))
      : [];
    const crons = attributable
      ? sortedUnique(files.flatMap((f) => result.factsByFile?.[f]?.crons ?? []))
      : [];
    const impact: DownstreamImpact = {
      symbol,
      file: declFiles.get(symbol)?.[0] ?? null,
      callers: rows.map<BlastCaller>((r) => ({ name: r.symbol, file: r.file, line: r.line })),
      callers_total: callersTotal,
      endpoints_affected: endpoints,
      crons_affected: crons,
    };
    return { impact, maxRank: rows[0]?.rank ?? 0 };
  });

  // 5. Most important symbols first (P3.5). D3: groups without callers never exist.
  entries.sort(
    (a, b) =>
      b.maxRank - a.maxRank ||
      (b.impact.callers_total ?? 0) - (a.impact.callers_total ?? 0) ||
      a.impact.symbol.localeCompare(b.impact.symbol),
  );
  const downstream = entries.map((e) => e.impact);

  const unattributed = attributable ? [] : sortedUnique(result.impactedEndpoints);
  const stats: BlastStats = {
    symbols_changed: result.changedSymbols.length,
    symbols_affected: downstream.length,
    callers: downstream.reduce((n, d) => n + (d.callers_total ?? d.callers.length), 0),
    endpoints: new Set([...downstream.flatMap((d) => d.endpoints_affected), ...unattributed]).size,
    crons: new Set(downstream.flatMap((d) => d.crons_affected)).size,
  };

  // 6. Degraded merge (trap 2): `partial` is not degraded on the facade result alone.
  const degraded = result.degraded === true || state.status !== 'full';
  const reason = mergeReason(result, state);

  const affected = new Set(downstream.map((d) => d.symbol));
  return {
    changed_symbols: result.changedSymbols
      .filter((s) => affected.has(s.name))
      .map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream,
    summary: buildSummary(stats, degraded, reason),
    degraded,
    reason,
    index_status: state.status,
    indexed_sha: state.lastIndexedSha || null,
    stats,
    ...(unattributed.length > 0 ? { unattributed_endpoints: unattributed } : {}),
  };
}

/**
 * Prior PRs (Design "Prior PRs", OD5): the current PR is excluded, results are
 * ordered newest `merged_at` first and capped at `HISTORY_MAX_ITEMS`. `notes` is
 * numbers-only text — no PR-authored text reaches it (security A05/A03).
 */
export function toPrHistory(
  items: PriorPr[],
  currentPrNumber: number,
  changedFiles: string[],
): PrHistory {
  const totalChanged = changedFiles.length;
  const history = items
    .filter((pr) => pr.number !== currentPrNumber)
    .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt))
    .slice(0, HISTORY_MAX_ITEMS)
    .map((pr) => ({
      pr_number: pr.number,
      title: pr.title,
      merged_at: pr.mergedAt,
      author: pr.author,
      files_overlap: pr.filesOverlap,
      notes: `touched ${pr.filesOverlap.length} of ${totalChanged} changed ${totalChanged === 1 ? 'file' : 'files'}`,
    }));
  return { history };
}
