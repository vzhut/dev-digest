/**
 * RepoIntelService — T1.1 facade skeleton.
 *
 * Every method returns a DEGRADED-but-valid result (see types.ts header). The
 * only methods that do real work in T1 are:
 *   - `getBlastRadius`: best-effort port of blast/service.ts logic, mapped
 *     into the `BlastResult` shape (and always tagged `degraded: true,
 *     reason: 'no_data'`, because T1 has no persistent index yet).
 *   - `getIndexState`: queries `repo_index_state` if the table exists (T2+),
 *     otherwise synthesises a degraded row so callers never throw.
 *
 * Everything else returns `[]` (array methods) or a degraded object literal
 * (object methods). T1.2 wires the astgrep adapter into
 * `getUnresolvedReferences` and (via T1.3) `getCallerSignatures`. T2 fills in
 * the rank-driven methods. T3 unlocks `getCriticalPaths` etc.
 *
 * The constructor takes ONLY a Container. No astgrep / depgraph / tokenizer
 * deps are imported here — those land later and plug into this same shell.
 */
import type { CodeSymbol, RepoRef, TourFacts } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { extractEndpoints } from '../../adapters/codeindex/extract.js';
import {
  parseImports,
  parseInvocationHeads,
  parseSymbols,
  langForFile,
} from '../../adapters/astgrep/index.js';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { RepoIntelRepository, type FullSymbolRow } from './repository.js';
import type {
  BlastCallerRow,
  BlastChangedSymbol,
  BlastResult,
  DegradedReason,
  FileRankRow,
  IndexResult,
  IndexState,
  PathKind,
  RefRow,
  RepoIntel,
  RepoMapResult,
  SignatureRow,
  SymbolRow,
} from './types.js';
import {
  BFS_DEPTH,
  DEFAULT_REPO_MAP_TOKEN_BUDGET,
  INDEX_JOB_KIND,
  INDEXER_VERSION,
  MAX_CALLERS_PER_SYMBOL,
  REFRESH_JOB_KIND,
  RESYNC_JOB_KIND,
  SUPPORTED_EXT,
} from './constants.js';
import { isJunkPath } from './junk-paths.js';
import { capCallersPerSymbol, declFilesBySymbol, importersWithin } from './helpers.js';
import { runFullIndex, type IndexPayload } from './pipeline/full.js';
import { runIncremental } from './pipeline/incremental.js';
import {
  buildRoutes,
  buildRunLocally,
  buildStructure,
  detectStack,
  hasHotnessHistory,
  hotnessWindowStart,
  rankReadingPath,
  scoreCandidates,
  selectCriticalPaths,
  type ManifestFile,
  type RankedFile,
} from './tour-facts.js';

/**
 * GLOBALS allowlist — common JS/TS builtins + runtime that appear as bare
 * invocations and are NOT phantoms. Tune for PRECISION (false-positive cost
 * > false-negative cost). Anything we miss here can be added
 * later; everything we include here is widely-used baseline.
 *
 * Kept module-scoped (not re-built per call) so the `.has(name)` lookup stays
 * O(1) on the hot path. The list intentionally errs on the inclusive side for
 * standard globals — better to under-flag than to spam reviewers with noise.
 */
const PHANTOM_GLOBALS_ALLOWLIST: ReadonlySet<string> = new Set([
  // Console / process / runtime
  'console', 'process', 'globalThis', 'require', 'module', 'exports',
  '__dirname', '__filename',
  // Math/JSON
  'Math', 'JSON',
  // Core ctors
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'Promise',
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'RegExp', 'Proxy', 'Reflect',
  'BigInt',
  // Timers / microtask
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'setImmediate', 'clearImmediate', 'queueMicrotask', 'structuredClone',
  // Web/Fetch standard
  'fetch', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder',
  'AbortController', 'AbortSignal', 'Headers', 'Request', 'Response',
  'FormData', 'Blob', 'File', 'FileReader',
  // Node
  'Buffer',
  // Browser globals
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
  'performance', 'crypto', 'location', 'history',
  // Numeric coercion / URI
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  // Misc keywords-that-parse-as-identifiers
  'super', 'this', 'arguments', 'undefined', 'NaN', 'Infinity',
  // Test/runtime affordances (vitest/jest globals; harmless to allow)
  'describe', 'it', 'test', 'expect', 'beforeAll', 'beforeEach',
  'afterAll', 'afterEach', 'vi', 'jest',
]);

export class RepoIntelService implements RepoIntel {
  private readonly repo: RepoIntelRepository;

  constructor(private container: Container) {
    this.repo = new RepoIntelRepository(container.db);
  }

  // -------------------------------------------------------------------------
  // Indexing — T2.2 worker. The job handlers (registered via
  // registerIndexJobHandlers below) are the ASYNC entry; these methods are
  // SYNC-from-the-handler (they ARE the handler body). HTTP/Repo callers go
  // through `container.jobs.enqueue(INDEX_JOB_KIND, ...)` so the clone job
  // closes promptly and the index runs in the background.
  // -------------------------------------------------------------------------

  /**
   * Run a full index of the repo INLINE (no enqueue). The job handler for
   * INDEX_JOB_KIND delegates to this, and tests / explicit calls can also
   * use it. The CI runner needs the synchronous variant — long-running CI
   * jobs already have their own time budget and don't want a second queue.
   */
  async indexRepo(repoId: string): Promise<IndexResult> {
    return runFullIndex(this.container, this.repo, { repoId });
  }

  /**
   * Run an incremental refresh INLINE. Same enqueue/inline split as indexRepo.
   * If the persisted state is missing or its `indexerVersion` is stale, this
   * delegates to `runFullIndex` internally.
   */
  async refreshIndex(repoId: string): Promise<IndexResult> {
    return runIncremental(this.container, this.repo, { repoId });
  }

  /**
   * Manual "re-analyze": advance the clone to `origin/<defaultBranch>` (so the
   * index reflects the latest code), then run an incremental refresh. The
   * incremental pass falls back to a full reindex internally when the diff base
   * is unreachable or the indexer version moved, so this is always
   * correct — never a destructive re-clone. Degrades (never throws) when the
   * repo isn't cloned yet or the fetch fails.
   */
  async resyncRepo(repoId: string): Promise<IndexResult> {
    const startedAt = Date.now();
    const repo = await this.repo.getRepoBasics(repoId);
    if (!repo || !repo.clonePath) {
      return { status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: Date.now() - startedAt, reason: 'no_clone' };
    }
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    try {
      await this.container.git.sync(ref, repo.defaultBranch);
    } catch (err) {
      return {
        status: 'degraded',
        filesIndexed: 0,
        filesSkipped: 0,
        durationMs: Date.now() - startedAt,
        reason: `sync_failed:${err instanceof Error ? err.message : String(err)}`,
      };
    }
    return runIncremental(this.container, this.repo, { repoId });
  }

  /**
   * Register the INDEX_JOB_KIND + REFRESH_JOB_KIND handlers on the JobRunner.
   * Mirrors `RepoService.registerCloneJobHandler` so the registration is an
   * explicit one-shot at app startup (`repoIntel/routes.ts` invokes this).
   *
   * The handlers swallow the IndexResult on purpose — JobRunner expects
   * `Promise<void>`. Status/progress is observable via `repo_index_state`.
   */
  registerIndexJobHandlers(): void {
    this.container.jobs.register(INDEX_JOB_KIND, async (payload) => {
      await this.indexRepo((payload as IndexPayload).repoId);
    });
    this.container.jobs.register(REFRESH_JOB_KIND, async (payload) => {
      await this.refreshIndex((payload as IndexPayload).repoId);
    });
    this.container.jobs.register(RESYNC_JOB_KIND, async (payload) => {
      await this.resyncRepo((payload as IndexPayload).repoId);
    });
  }

  /**
   * ALWAYS works. If `repo_index_state` exists and has a row, returns it.
   * Otherwise synthesises a degraded row so callers can branch on `degraded`
   * without ever hitting a thrown error.
   */
  async getIndexState(repoId: string): Promise<IndexState> {
    const persisted = await this.repo.tryGetIndexState(repoId);
    if (persisted) return persisted;
    return {
      repoId,
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: 0,
      reason: 'no_data',
      lastIndexedSha: '',
      indexerVersion: INDEXER_VERSION,
      updatedAt: new Date(0),
      degraded: true,
      degradedReason: 'no_data',
    };
  }

  // -------------------------------------------------------------------------
  // Reads.
  // -------------------------------------------------------------------------

  /**
   * Best-effort blast over `container.codeIndex` — a faithful port of
   * blast/service.ts mapped into the facade's `BlastResult` shape, then
   * tagged `degraded: true` so consumers can branch.
   *
   * Why "always degraded" in T1: there's no persistent rank/decl_file yet, so
   * every caller gets `rank: 0` and HTTP impact is detected by re-reading the
   * clone (not the index). T2 promotes this path to the persistent layer.
   */
  async getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastResult> {
    // T3: serve from the persistent index when it's built. Falls through to the
    // ripgrep best-effort below when the flag is off / index is absent.
    const flagOn = this.container.config.repoIntelEnabled;
    if (flagOn && changedFiles.length > 0) {
      const persistent = await this.tryPersistentBlast(repoId, changedFiles);
      if (persistent) return persistent;
    }

    const reason: DegradedReason = flagOn ? 'no_data' : 'flag_off';
    const empty: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason,
    };

    const repo = await this.repo.getRepoBasics(repoId);
    if (!repo || !repo.clonePath || changedFiles.length === 0) return empty;

    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const changedSet = new Set(changedFiles);

    let allSymbols: CodeSymbol[];
    try {
      allSymbols = await this.container.codeIndex.symbols(ref);
    } catch {
      return empty;
    }

    // changed symbols = declared in any changed file (dedup by name+file).
    const changedSymbols: BlastChangedSymbol[] = [];
    const seen = new Set<string>();
    for (const s of allSymbols) {
      if (!changedSet.has(s.path)) continue;
      const key = `${s.name}:${s.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      changedSymbols.push({ file: s.path, name: s.name, kind: s.kind });
    }

    const callerRows: BlastCallerRow[] = [];
    const endpoints = new Set<string>();
    const callerSeen = new Set<string>();

    for (const sym of changedSymbols) {
      let refs;
      try {
        refs = await this.container.codeIndex.references(ref, sym.name);
      } catch {
        continue;
      }
      const callerFiles = new Set<string>();
      for (const r of refs) {
        if (r.fromPath === sym.file) continue; // skip the decl's own file
        const callerName = enclosingSymbolName(allSymbols, r.fromPath, r.line);
        const key = `${r.fromPath}|${callerName}|${sym.name}`;
        if (callerSeen.has(key)) continue;
        callerSeen.add(key);
        callerRows.push({
          file: r.fromPath,
          symbol: callerName,
          viaSymbol: sym.name,
          line: r.line,
          rank: 0, // ripgrep/degraded path has no persistent rank
        });
        callerFiles.add(r.fromPath);
      }

      // Detect HTTP routes reachable from any caller file (best-effort, just
      // like the legacy blast service).
      for (const file of callerFiles) {
        const content = await readClone(repo.clonePath, file);
        if (!content) continue;
        for (const e of extractEndpoints(content)) endpoints.add(e);
      }
    }

    const capped = capCallersPerSymbol(
      callerRows,
      declFilesBySymbol(changedSymbols),
      MAX_CALLERS_PER_SYMBOL,
    );
    return {
      changedSymbols,
      callers: capped.callers,
      callerTotals: capped.totals,
      impactedEndpoints: [...endpoints],
      degraded: true,
      reason,
    };
  }

  /**
   * Persistent-index blast (T3): reads symbols / resolved references / file_rank
   * / file_facts straight from Postgres — NO clone parsing on the hot path.
   * Returns `null` when the index isn't usable (caller falls back to ripgrep).
   *
   * Callers are PRECISE: only references whose `decl_file` resolved to a changed
   * file count. That favours precision over recall — an ambiguous
   * (NULL decl_file) reference is not asserted as a caller.
   */
  private async tryPersistentBlast(
    repoId: string,
    changedFiles: string[],
  ): Promise<BlastResult | null> {
    const state = await this.repo.tryGetIndexState(repoId);
    if (!state || (state.status !== 'full' && state.status !== 'partial')) return null;

    // Changed symbols = declared in a changed file. Skip the qualified
    // `Class.method` dual-emit (the bare form already covers the name).
    const declRows = await this.repo.getSymbolRows(repoId, changedFiles);
    const changedSymbols: BlastChangedSymbol[] = [];
    const nameSet = new Set<string>();
    const seenSym = new Set<string>();
    for (const s of declRows) {
      if (s.name.includes('.')) continue;
      const key = `${s.name}:${s.path}`;
      if (!seenSym.has(key)) {
        seenSym.add(key);
        changedSymbols.push({ file: s.path, name: s.name, kind: s.kind });
      }
      nameSet.add(s.name);
    }
    if (nameSet.size === 0) {
      return { changedSymbols, callers: [], impactedEndpoints: [], degraded: false };
    }

    // Resolved cross-file callers.
    const callerRows = await this.repo.getResolvedCallers(repoId, changedFiles, [...nameSet]);
    const callerFiles = [...new Set(callerRows.map((c) => c.fromPath))];

    // Enclosing caller symbol from the callers' persistent symbol rows.
    const callerSymRows = await this.repo.getSymbolRows(repoId, callerFiles);
    const symsByFile = new Map<string, FullSymbolRow[]>();
    for (const s of callerSymRows) {
      const arr = symsByFile.get(s.path);
      if (arr) arr.push(s);
      else symsByFile.set(s.path, [s]);
    }

    const callers: BlastCallerRow[] = [];
    const seenCaller = new Set<string>();
    for (const c of callerRows) {
      const enclosing =
        enclosingFromRows(symsByFile.get(c.fromPath) ?? [], c.line) ??
        c.fromPath.split('/').pop() ??
        c.fromPath;
      const key = `${c.fromPath}|${enclosing}|${c.toSymbol}`;
      if (seenCaller.has(key)) continue;
      seenCaller.add(key);
      callers.push({
        file: c.fromPath,
        symbol: enclosing,
        viaSymbol: c.toSymbol,
        line: c.line,
        rank: c.rank,
      });
    }

    // Widen endpoint attribution to a caller's importers (T10, OD2): a caller
    // is often a service method with no route decorator of its own — the
    // route file that imports it is where `extractEndpoints` actually finds
    // the HTTP verb+path. `BFS_DEPTH - 1` importer hops from the caller
    // (hop 1 is the caller itself, per the changed symbol).
    const changedFileSet = new Set(changedFiles);
    const edges = callerFiles.length > 0 ? await this.repo.getEdges(repoId) : [];
    const importersByCaller = importersWithin(edges, callerFiles, BFS_DEPTH - 1);
    const importerFiles = new Set<string>();
    for (const importers of importersByCaller.values()) {
      for (const file of importers) {
        if (changedFileSet.has(file)) continue; // never attribute back to a changed file
        importerFiles.add(file);
      }
    }

    // Precomputed facts per caller file AND its importers (endpoints + crons).
    const factFiles = [...new Set([...callerFiles, ...importerFiles])];
    const facts = await this.repo.getFileFacts(repoId, factFiles);
    const endpoints = new Set<string>();
    const factsByRawFile = new Map<string, { endpoints: string[]; crons: string[] }>();
    for (const f of facts) {
      factsByRawFile.set(f.filePath, { endpoints: f.endpoints, crons: f.crons });
      for (const e of f.endpoints) endpoints.add(e);
    }

    // factsByFile[callerFile] = union of the caller's own facts and its
    // importers' facts (within depth). Missing entries are treated as empty.
    const factsByFile: Record<string, { endpoints: string[]; crons: string[] }> = {};
    for (const callerFile of callerFiles) {
      const own = factsByRawFile.get(callerFile);
      const importerFacts = [...(importersByCaller.get(callerFile) ?? [])]
        .map((f) => factsByRawFile.get(f))
        .filter((f): f is { endpoints: string[]; crons: string[] } => f != null);
      factsByFile[callerFile] = {
        endpoints: [...new Set([...(own?.endpoints ?? []), ...importerFacts.flatMap((f) => f.endpoints)])],
        crons: [...new Set([...(own?.crons ?? []), ...importerFacts.flatMap((f) => f.crons)])],
      };
    }

    // Cap per changed symbol (not globally) AFTER facts were gathered for all caller files.
    const capped = capCallersPerSymbol(
      callers,
      declFilesBySymbol(changedSymbols),
      MAX_CALLERS_PER_SYMBOL,
    );
    return {
      changedSymbols,
      callers: capped.callers,
      callerTotals: capped.totals,
      impactedEndpoints: [...endpoints],
      factsByFile,
      degraded: false,
    };
  }

  /**
   * Serve the cached repo-map for the repo's last-indexed SHA. The map is only
   * rendered by the pipeline at `DEFAULT_REPO_MAP_TOKEN_BUDGET`; other budgets
   * (or an unindexed / partial-without-rank repo) miss and degrade cleanly.
   */
  async getRepoMap(repoId: string, tokenBudget?: number): Promise<RepoMapResult> {
    const degraded: RepoMapResult = {
      text: '',
      tokens: 0,
      cached: false,
      degraded: true,
      reason: 'no_data',
    };
    if (!this.container.config.repoIntelEnabled) {
      return { ...degraded, reason: 'flag_off' };
    }
    const state = await this.repo.tryGetIndexState(repoId);
    if (!state || !state.lastIndexedSha) return degraded;
    const budget = tokenBudget ?? DEFAULT_REPO_MAP_TOKEN_BUDGET;
    const hit = await this.repo.getRepoMapCache(repoId, state.lastIndexedSha, budget);
    if (!hit) return degraded;
    return { text: hit.mapText, tokens: hit.tokenCount, cached: true };
  }

  /** Percentile per path from `file_rank` (smart-diff / run-executor "top-N%"). */
  async getFileRank(repoId: string, paths: string[]): Promise<FileRankRow[]> {
    if (!this.container.config.repoIntelEnabled) return [];
    if (paths.length === 0) return [];
    return this.repo.getFileRankFor(repoId, paths);
  }

  /** Persistent symbol read-model (T2 columns) for the given files. */
  async getSymbolsInFiles(repoId: string, paths: string[]): Promise<SymbolRow[]> {
    if (!this.container.config.repoIntelEnabled) return [];
    if (paths.length === 0) return [];
    const rows = await this.repo.getSymbolRows(repoId, paths);
    return rows.map((r) => ({
      file: r.path,
      name: r.name,
      kind: r.kind,
      exported: r.exported,
      startLine: r.line ?? 0,
      endLine: r.endLine ?? r.line ?? 0,
      signature: r.signature,
    }));
  }

  /**
   * T1.3 — diff-scoped, best-effort callers-in-prompt fuel.
   *
   * For each symbol declared in a changed file (astgrep parseSymbols), find
   * cross-file callers via the EXISTING ripgrep-backed `container.codeIndex.
   * references()` (the same path blast already trusts), then label each caller
   * with its enclosing symbol + signature (astgrep parseSymbols of the caller
   * file). rank=0 until T3 wires file_rank.
   *
   * Skips type/interface symbols (no call sites). Returns at most `limit` rows,
   * deduped by (file, symbol, viaSymbol). Degraded gate: flag off, missing
   * clone, or empty input → `[]`.
   */
  async getCallerSignatures(
    repoId: string,
    changedFiles: string[],
    limit: number = MAX_CALLERS_PER_SYMBOL,
  ): Promise<SignatureRow[]> {
    if (!this.container.config.repoIntelEnabled) return [];
    if (changedFiles.length === 0) return [];

    const repo = await this.repo.getRepoBasics(repoId);
    if (!repo || !repo.clonePath) return [];

    // 1. Symbols declared in changed files. Filter to symbols that can BE
    //    called (function / method / class). Type/interface aliases have no
    //    call sites, so chasing references for them just wastes work.
    const declaredSymbols = new Map<string, { file: string; kind: string }>();
    for (const file of changedFiles) {
      if (!langForFile(file)) continue;
      const source = await readClone(repo.clonePath, file);
      if (source == null) continue;
      try {
        for (const s of parseSymbols(file, source)) {
          if (s.kind !== 'function' && s.kind !== 'method' && s.kind !== 'class') continue;
          // Dual-emit (Class.method + method): only store the bare name; the
          // qualified form would double-count callers.
          if (s.name.includes('.')) continue;
          if (!declaredSymbols.has(s.name)) {
            declaredSymbols.set(s.name, { file, kind: s.kind });
          }
        }
      } catch {
        // skip unparseable files — diff-scoped, never throw
      }
    }
    if (declaredSymbols.size === 0) return [];

    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const out: SignatureRow[] = [];
    const seen = new Set<string>();
    // Cache caller-file astgrep parses so we don't re-parse the same file per
    // referenced symbol.
    const callerSymbolsByFile = new Map<string, ReturnType<typeof parseSymbols>>();

    for (const [symbolName, decl] of declaredSymbols) {
      if (out.length >= limit) break;
      let refs;
      try {
        refs = await this.container.codeIndex.references(ref, symbolName);
      } catch {
        continue;
      }
      for (const r of refs) {
        if (out.length >= limit) break;
        if (r.fromPath === decl.file) continue; // skip self-references

        // Parse the caller file once; reuse for further symbols in this loop.
        let callerSyms = callerSymbolsByFile.get(r.fromPath);
        if (callerSyms === undefined) {
          if (!langForFile(r.fromPath)) {
            callerSymbolsByFile.set(r.fromPath, []);
            callerSyms = [];
          } else {
            const callerSrc = await readClone(repo.clonePath, r.fromPath);
            if (callerSrc == null) {
              callerSymbolsByFile.set(r.fromPath, []);
              callerSyms = [];
            } else {
              try {
                callerSyms = parseSymbols(r.fromPath, callerSrc);
              } catch {
                callerSyms = [];
              }
              callerSymbolsByFile.set(r.fromPath, callerSyms);
            }
          }
        }

        // Pick the enclosing top-level symbol (largest line ≤ ref.line, no
        // qualified names — match blast/helpers.ts callerName behavior).
        const enclosing = (callerSyms ?? [])
          .filter((s) => s.line <= r.line && !s.name.includes('.'))
          .sort((a, b) => b.line - a.line)[0];
        if (!enclosing) continue; // no enclosing symbol → no signature to emit
        const signature = enclosing.signature;
        if (!signature) continue;

        const dedupKey = `${r.fromPath}|${enclosing.name}|${symbolName}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        out.push({
          file: r.fromPath,
          symbol: enclosing.name,
          signature,
          rank: 0, // enriched from file_rank below (T3)
        });
      }
    }

    // T3: enrich each caller with its file's rank percentile so the prompt can
    // lead with the most important callers. No-op when no index exists yet.
    if (out.length > 0) {
      const files = [...new Set(out.map((o) => o.file))];
      const ranks = await this.repo.getFileRankFor(repoId, files);
      if (ranks.length > 0) {
        const byFile = new Map(ranks.map((r) => [r.path, r.percentile]));
        for (const o of out) o.rank = byFile.get(o.file) ?? 0;
        out.sort((a, b) => b.rank - a.rank);
      }
    }

    return out;
  }

  /**
   * T1.3 — diff-scoped phantom-API gate fuel.
   *
   * For each changed file: collect bare invocation heads (astgrep
   * parseInvocationHeads). A head is PHANTOM iff it is NOT declared in this
   * file, NOT imported in this file, NOT a JS/TS keyword, and NOT a known
   * runtime/builtin global. `declFile` is intentionally `null` in T1 — Tier 1
   * is ephemeral (no persistent decl_file column; that lands in T2).
   *
   * Degraded gate: flag off, missing clone, or no parseable files → `[]`.
   * NEVER throws — per-file parse errors are swallowed.
   */
  async getUnresolvedReferences(repoId: string, files: string[]): Promise<RefRow[]> {
    if (!this.container.config.repoIntelEnabled) return [];
    if (files.length === 0) return [];

    const repo = await this.repo.getRepoBasics(repoId);
    if (!repo || !repo.clonePath) return [];

    const out: RefRow[] = [];

    for (const file of files) {
      const ext = extname(file).toLowerCase();
      if (!(SUPPORTED_EXT as readonly string[]).includes(ext)) continue;

      const source = await readClone(repo.clonePath, file);
      if (source == null) continue;

      let declared: ReturnType<typeof parseSymbols>;
      let imports: ReturnType<typeof parseImports>;
      let heads: ReturnType<typeof parseInvocationHeads>;
      try {
        declared = parseSymbols(file, source);
        imports = parseImports(file, source);
        heads = parseInvocationHeads(file, source);
      } catch {
        // Tree-sitter is lenient but a napi-level failure shouldn't blow up
        // the whole gate. Skip the file (= "no phantoms here" — conservative).
        continue;
      }

      // Build the "declared-or-imported" name set. parseSymbols already emits
      // both qualified (`Class.method`) and bare (`method`) forms, so a method
      // declared anywhere in the file is resolvable as the bare invocation.
      const knownNames = new Set<string>();
      for (const s of declared) knownNames.add(s.name);
      for (const i of imports) knownNames.add(i.name);

      for (const head of heads) {
        if (knownNames.has(head.name)) continue;
        if (PHANTOM_GLOBALS_ALLOWLIST.has(head.name)) continue;
        out.push({
          refFile: file,
          refLine: head.line,
          symbolName: head.name,
          declFile: null, // T1: ephemeral
        });
      }
    }

    return out;
  }

  /** Top-N files by rank, minus tests/configs/migrations — conventions sample. */
  async getConventionSamples(repoId: string, n: number): Promise<string[]> {
    return this.getTopFilesByRank(repoId, n);
  }

  /**
   * Top-N file paths by rank DESC, dropping tests/configs/migrations and any
   * caller-supplied `exclude` substrings. Over-fetches by 10× before filtering
   * so the post-filter still yields N where possible.
   */
  async getTopFilesByRank(
    repoId: string,
    n: number,
    opts?: { exclude?: string[] },
  ): Promise<string[]> {
    if (!this.container.config.repoIntelEnabled) return [];
    if (n <= 0) return [];
    const exclude = opts?.exclude ?? [];
    const rows = await this.repo.getRankedPaths(repoId, Math.max(n * 10, 100));
    const out: string[] = [];
    for (const r of rows) {
      if (isJunkPath(r.path)) continue;
      if (exclude.some((e) => r.path.includes(e))) continue;
      out.push(r.path);
      if (out.length >= n) break;
    }
    return out;
  }

  /**
   * Dependency chains from the highest-ranked files (onboarding reading-path).
   * For each of the top roots, greedily follow the highest-ranked import target
   * up to BFS_DEPTH hops. Pure read over `file_edges` + `file_rank`.
   */
  async getCriticalPaths(repoId: string): Promise<string[][]> {
    if (!this.container.config.repoIntelEnabled) return [];
    const edges = await this.repo.getEdges(repoId);
    if (edges.length === 0) return [];

    const ranked = await this.repo.getRankedPaths(repoId, 100_000);
    const rankOf = new Map(ranked.map((r) => [r.path, r.rank]));

    // Adjacency importer → imported.
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      const arr = adj.get(e.fromFile);
      if (arr) arr.push(e.toFile);
      else adj.set(e.fromFile, [e.toFile]);
    }

    const roots = ranked.slice(0, CRITICAL_PATH_ROOTS).map((r) => r.path);
    const paths: string[][] = [];
    const seenPaths = new Set<string>();
    for (const root of roots) {
      const chain = [root];
      const inChain = new Set(chain);
      let cur = root;
      for (let depth = 0; depth < BFS_DEPTH; depth += 1) {
        const next = (adj.get(cur) ?? [])
          .filter((t) => !inChain.has(t))
          .sort((a, b) => (rankOf.get(b) ?? 0) - (rankOf.get(a) ?? 0))[0];
        if (!next) break;
        chain.push(next);
        inChain.add(next);
        cur = next;
      }
      if (chain.length < 2) continue;
      const key = chain.join('>');
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);
      paths.push(chain);
    }
    return paths;
  }

  // -------------------------------------------------------------------------
  // L05 onboarding tour — deterministic facts. Makes NO LLM call: every input is
  // the Postgres index plus read-only git blobs at ONE commit (`source_sha`).
  // -------------------------------------------------------------------------

  /**
   * Collect the facts the tour is built from. Never throws on a bad index: an unusable
   * index is reported through `index.usable` / `index.unusable_reason` and the rank-driven
   * lists stay empty, while clone-derived facts (stack, run-locally, README) are still read.
   */
  async collectTourFacts(repoId: string): Promise<TourFacts> {
    const basics = await this.repo.getRepoBasics(repoId);
    const cloneDir = basics?.clonePath ?? null;
    const snapshot = this.container.repoSnapshot;
    const state = await this.repo.tryGetIndexState(repoId);
    const lastIndexedSha = state?.lastIndexedSha ? state.lastIndexedSha : null;
    const flagOn = this.container.config.repoIntelEnabled;

    const head = cloneDir ? await snapshot.headSha(cloneDir) : null;
    const shaInClone =
      cloneDir !== null && lastIndexedSha !== null && (await snapshot.commitDate(cloneDir, lastIndexedSha)) !== null;
    // F7: an index commit that the clone no longer has (force-push, shallow resync) cannot be read;
    // the tour then describes HEAD and the index counts as unusable.
    const sourceSha = shaInClone ? lastIndexedSha! : (head ?? '');

    const rankRows = flagOn && state ? await this.repo.getAllRankRows(repoId) : [];
    const unusableReason = classifyTourIndex({
      flagOn,
      status: state?.status ?? null,
      rankedFiles: rankRows.length,
      shaInClone,
    });
    const usable = unusableReason === null;

    const files =
      cloneDir && sourceSha ? (await snapshot.listFiles(cloneDir, sourceSha)).files.slice().sort(byPathAsc) : [];
    const manifests = cloneDir && sourceSha ? await this.readManifests(cloneDir, sourceSha, files) : [];
    const readme = cloneDir && sourceSha ? await this.readReadme(cloneDir, sourceSha, files) : null;

    const stats = state ? await this.repo.getIndexStats(repoId) : null;
    // F4: `files_indexed` is the real row count — `stats.filesIndexed` double-counts after an
    // incremental refresh, and an incremental refresh drops `totalCandidates` / `bounded`.
    const totalCandidates = typeof stats?.totalCandidates === 'number' ? stats.totalCandidates : null;
    const bounded = typeof stats?.bounded === 'number' && stats.bounded > 0;

    let churnCounts: ReadonlyMap<string, number> | null = null;
    if (usable && cloneDir) {
      // D2: the window is anchored at the committer date of `source_sha`, not "now".
      const date = await snapshot.commitDate(cloneDir, sourceSha);
      if (date) {
        const churn = await snapshot.churn(cloneDir, sourceSha, hotnessWindowStart(date));
        if (hasHotnessHistory(churn.commits)) churnCounts = churn.counts;
      }
    }

    const base = {
      stack: detectStack(manifests),
      run_locally: buildRunLocally(manifests),
      readme,
    };
    const index = {
      status: state?.status ?? 'no_data',
      reason: state?.reason ?? null,
      files_indexed: rankRows.length,
      files_skipped: state?.filesSkipped ?? 0,
      files_total: totalCandidates,
      bounded,
      hotness_available: churnCounts !== null,
      usable,
      unusable_reason: unusableReason,
      last_indexed_sha: lastIndexedSha,
    };

    if (!usable) {
      return {
        source_sha: sourceSha,
        index,
        ...base,
        structure: buildStructure(files),
        routes: [],
        critical_paths: [],
        reading_path: [],
      };
    }

    const [inbound, edges, endpointRows] = await Promise.all([
      this.repo.getInboundCounts(repoId),
      this.repo.getEdges(repoId),
      this.repo.getAllEndpointFacts(repoId),
    ]);
    const ranked: RankedFile[] = rankRows.map((r) => ({
      path: r.path,
      pagerank: r.pagerank,
      importedBy: inbound.get(r.path) ?? 0,
      percentile: r.percentile,
    }));
    const scored = scoreCandidates(ranked, churnCounts);
    const scoreByFile = new Map(scored.map((f) => [f.path, f.score]));

    const imports = new Map<string, string[]>();
    for (const e of edges) {
      const targets = imports.get(e.fromFile);
      if (targets) targets.push(e.toFile);
      else imports.set(e.fromFile, [e.toFile]);
    }
    const endpoints = endpointRows
      .filter((r) => !isJunkPath(r.filePath))
      .flatMap((r) =>
        r.endpoints.map((e) => {
          const space = e.indexOf(' ');
          return { method: space === -1 ? e : e.slice(0, space), path: space === -1 ? '' : e.slice(space + 1), file: r.filePath };
        }),
      );

    return {
      source_sha: sourceSha,
      index,
      ...base,
      structure: buildStructure(rankRows.map((r) => r.path)),
      routes: buildRoutes(endpoints, scoreByFile),
      critical_paths: selectCriticalPaths(scored, imports, [...new Set(endpoints.map((e) => e.file))]),
      reading_path: rankReadingPath(scored),
    };
  }

  /** `file` / `dir` / `missing` for each path at `sha` (AC-17: first-task paths are checked, not trusted). */
  async classifyPaths(repoId: string, sha: string, paths: string[]): Promise<Record<string, PathKind>> {
    const out: Record<string, PathKind> = {};
    const basics = await this.repo.getRepoBasics(repoId);
    const listing = basics?.clonePath ? await this.container.repoSnapshot.listFiles(basics.clonePath, sha) : null;
    const fileSet = new Set(listing?.files ?? []);
    const dirSet = new Set<string>();
    for (const f of fileSet) {
      for (let i = f.indexOf('/'); i !== -1; i = f.indexOf('/', i + 1)) dirSet.add(f.slice(0, i));
    }
    for (const raw of paths) {
      const p = raw.replace(/\/+$/, '');
      out[raw] = fileSet.has(p) ? 'file' : dirSet.has(p) ? 'dir' : 'missing';
    }
    return out;
  }

  /** Manifests at the root or one level below, read as git blobs (presence-only ones are not read). */
  private async readManifests(cloneDir: string, sha: string, files: readonly string[]): Promise<ManifestFile[]> {
    const wanted = files.filter((f) => f.split('/').length <= 2 && isManifestName(f.slice(f.lastIndexOf('/') + 1)));
    // Root entries first so the cap never evicts the root package.json.
    wanted.sort((a, b) => a.split('/').length - b.split('/').length || byPathAsc(a, b));
    const picked = wanted.slice(0, MANIFEST_MAX_FILES);
    const snapshot = this.container.repoSnapshot;
    return Promise.all(
      picked.map(async (path): Promise<ManifestFile> => {
        if (!needsManifestText(path.slice(path.lastIndexOf('/') + 1))) return { path, text: '' };
        const r = await snapshot.readText(cloneDir, sha, path, MANIFEST_MAX_BYTES);
        return { path, text: r.status === 'ok' ? r.text : '' };
      }),
    );
  }

  private async readReadme(cloneDir: string, sha: string, files: readonly string[]): Promise<TourFacts['readme']> {
    const present = new Set(files);
    for (const path of README_CANDIDATES) {
      if (!present.has(path)) continue;
      const r = await this.container.repoSnapshot.readText(cloneDir, sha, path, README_MAX_BYTES);
      if (r.status === 'ok') return { path, text: r.text.slice(0, README_MAX_CHARS) };
    }
    return null;
  }
}

/** README names tried at the clone root, in order (AC-7). */
const README_CANDIDATES = ['README.md', 'readme.md', 'README'] as const;
const README_MAX_BYTES = 256 * 1024;
const README_MAX_CHARS = 20_000;
const MANIFEST_MAX_BYTES = 128 * 1024;
const MANIFEST_MAX_FILES = 40;
/** Files whose presence alone is evidence (stack / run-locally); their text is never read. */
const PRESENCE_MANIFESTS = new Set([
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'tsconfig.json',
  'Dockerfile',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
  '.env.example',
]);
const COMPOSE_NAME = /^(docker-)?compose[^/]*\.ya?ml$/i;

function isManifestName(name: string): boolean {
  return PRESENCE_MANIFESTS.has(name) || name === 'package.json' || name === 'Makefile' || COMPOSE_NAME.test(name);
}

function needsManifestText(name: string): boolean {
  return name === 'package.json' || name === 'Makefile' || COMPOSE_NAME.test(name);
}

function byPathAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

type TourUnusableReason = NonNullable<TourFacts['index']['unusable_reason']>;

/**
 * Why the persisted index cannot drive a tour, or `null` when it can. Same precedence as the
 * onboarding module's `classifyIndex` (kept local: modules never import each other).
 */
function classifyTourIndex(s: {
  flagOn: boolean;
  status: string | null;
  rankedFiles: number;
  shaInClone: boolean;
}): TourUnusableReason | null {
  if (!s.flagOn) return 'flag_off';
  if (s.status === null) return 'no_data';
  if (s.status === 'failed') return 'failed';
  if (s.status === 'degraded') return 'degraded';
  if (!s.shaInClone) return 'sha_missing';
  if (s.rankedFiles <= 0) return 'no_ranked_files';
  return null;
}

/** How many top-ranked files seed `getCriticalPaths` dependency chains. */
const CRITICAL_PATH_ROOTS = 5;

/** Enclosing top-level (bare-name) symbol for a line, from persistent rows. */
function enclosingFromRows(rows: FullSymbolRow[], line: number): string | null {
  const hit = rows
    .filter((s) => !s.name.includes('.') && (s.line ?? 0) <= line)
    .sort((a, b) => (b.line ?? 0) - (a.line ?? 0))[0];
  return hit?.name ?? null;
}

// ---------------------------------------------------------------------------
// helpers — local to T1, replaced when blast/onboarding migrate to the facade.
// ---------------------------------------------------------------------------

/**
 * Best-effort: name the enclosing top-level symbol of a reference line. Mirrors
 * blast/helpers.ts callerName so we get the same caller labels.
 */
function enclosingSymbolName(
  allSymbols: CodeSymbol[],
  fromPath: string,
  line: number,
): string {
  const inFile = allSymbols
    .filter((s) => s.path === fromPath && s.line <= line && !s.name.includes('.'))
    .sort((a, b) => b.line - a.line);
  return inFile[0]?.name ?? fromPath.split('/').pop() ?? fromPath;
}

async function readClone(clonePath: string, file: string): Promise<string | null> {
  return readFile(join(clonePath, file), 'utf8').catch(() => null);
}
