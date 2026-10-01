/**
 * repo-intel pure helpers (no DB, no I/O). Used by the facade's blast path.
 */
import type { BlastCallerRow } from './types.js';

export interface CappedCallers {
  callers: BlastCallerRow[];
  /** Caller count per `viaSymbol` BEFORE the cap (after the decl-file filter). */
  totals: Record<string, number>;
}

/**
 * Cap callers PER changed symbol (not globally), so a busy symbol cannot starve
 * the others.
 *  - drops callers living in a file that declares the symbol they reach
 *    (defensive: structurally impossible on the persistent path, possible on the
 *    ripgrep path when a name is declared in two changed files);
 *  - sorts by rank desc, then file, then line (deterministic);
 *  - keeps at most `max` callers per `viaSymbol`;
 *  - reports the pre-cap count per symbol in `totals`.
 */
export function capCallersPerSymbol(
  callers: BlastCallerRow[],
  declFilesBySymbol: ReadonlyMap<string, ReadonlySet<string>>,
  max: number,
): CappedCallers {
  const sorted = callers
    .filter((c) => !declFilesBySymbol.get(c.viaSymbol)?.has(c.file))
    .sort((a, b) => b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line);

  const totals: Record<string, number> = {};
  const kept: BlastCallerRow[] = [];
  for (const c of sorted) {
    const seen = totals[c.viaSymbol] ?? 0;
    totals[c.viaSymbol] = seen + 1;
    if (seen < max) kept.push(c);
  }
  return { callers: kept, totals };
}

/** symbol name → set of changed files declaring it. */
export function declFilesBySymbol(
  changedSymbols: ReadonlyArray<{ file: string; name: string }>,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const s of changedSymbols) {
    const files = map.get(s.name);
    if (files) files.add(s.file);
    else map.set(s.name, new Set([s.file]));
  }
  return map;
}

/**
 * For each caller file, the set of files that import it (transitively)
 * within `depth` hops over the import graph — an edge `{fromFile, toFile}`
 * means `fromFile` imports `toFile`, so an "importer of X" is any `fromFile`
 * of an edge whose `toFile` is X. `depth = 1` returns only direct importers;
 * `depth <= 0` returns an empty set per caller file.
 *
 * Used to widen `factsByFile` (T10, OD2): the facade attributes endpoints
 * declared in a caller's importer (e.g. a route file importing the service
 * that calls the changed symbol) back to that caller, up to `BFS_DEPTH - 1`
 * importer hops.
 *
 * Cycles are safe: each caller file gets its own `visited` set, so a file
 * reachable via two paths (or via an import cycle) is only counted once and
 * BFS terminates.
 */
export function importersWithin(
  edges: ReadonlyArray<{ fromFile: string; toFile: string }>,
  callerFiles: readonly string[],
  depth: number,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  if (callerFiles.length === 0) return result;
  if (depth <= 0) {
    for (const file of callerFiles) result.set(file, new Set());
    return result;
  }

  // Reverse adjacency: toFile -> the fromFiles that import it.
  const importersOf = new Map<string, string[]>();
  for (const e of edges) {
    const arr = importersOf.get(e.toFile);
    if (arr) arr.push(e.fromFile);
    else importersOf.set(e.toFile, [e.fromFile]);
  }

  for (const callerFile of callerFiles) {
    const visited = new Set<string>([callerFile]);
    const importers = new Set<string>();
    let frontier = [callerFile];
    for (let hop = 0; hop < depth && frontier.length > 0; hop += 1) {
      const next: string[] = [];
      for (const file of frontier) {
        for (const importer of importersOf.get(file) ?? []) {
          if (visited.has(importer)) continue;
          visited.add(importer);
          importers.add(importer);
          next.push(importer);
        }
      }
      frontier = next;
    }
    result.set(callerFile, importers);
  }
  return result;
}
