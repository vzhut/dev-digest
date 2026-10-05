import type { TourFacts } from '@devdigest/shared';
import { EXCLUDED_DIRS, HOTNESS_WINDOW_DAYS } from './constants.js';
import { isJunkPath } from './junk-paths.js';

/** Pure builders for the onboarding tour's deterministic facts (no I/O). */

export const STRUCTURE_MAX_DEPTH = 2;
export const STRUCTURE_MAX_ENTRIES = 40;
export const ROUTES_MAX = 50;
export const READING_PATH_MAX = 8;
export const CRITICAL_PATHS_MAX = 6;
/** Top-ranked files that seed critical-path dependency chains. */
export const CRITICAL_PATH_SEEDS = 5;
/** Max hops followed from a seed. */
export const CRITICAL_PATH_CHAIN_DEPTH = 3;
/** Hand-rolled line parsers read at most this many characters (F8). */
export const PARSE_INPUT_MAX_CHARS = 64 * 1024;
/** Churn is only meaningful with more than this many commits in the clone (D2). */
export const HOTNESS_MIN_COMMITS = 1;
/** D4: compose services whose name or image name starts with one of these are data stores. */
export const DATA_STORE_PREFIXES = [
  'postgres',
  'postgresql',
  'mysql',
  'mariadb',
  'mongo',
  'mongodb',
  'redis',
  'valkey',
  'memcached',
  'elasticsearch',
  'opensearch',
  'rabbitmq',
  'kafka',
  'minio',
  'db',
] as const;

type StackItem = TourFacts['stack'][number];
type StructureItem = TourFacts['structure'][number];
type RouteItem = TourFacts['routes'][number];
type RunLocallyItem = TourFacts['run_locally'][number];
type CriticalPathItem = TourFacts['critical_paths'][number];
type ReadingPathItem = TourFacts['reading_path'][number];

/** A manifest file read from the clone. `text` may be empty when only presence matters. */
export interface ManifestFile {
  path: string;
  text: string;
}

export interface RankedFile {
  path: string;
  pagerank: number;
  importedBy: number;
  percentile: number;
}

export interface ScoredFile extends RankedFile {
  hotness: number;
  score: number;
}

const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;

const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function depthOf(path: string): number {
  return path.split('/').length - 1;
}

/** Manifests at the clone root or one directory below, root first, then alphabetical. */
function nearManifests(manifests: readonly ManifestFile[]): ManifestFile[] {
  return manifests
    .filter((m) => depthOf(m.path) <= 1)
    .sort((a, b) => depthOf(a.path) - depthOf(b.path) || byPath(a.path, b.path));
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function isComposeFile(name: string): boolean {
  return /^(docker-)?compose[^/]*\.ya?ml$/i.test(name);
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function packageDeps(text: string): string[] {
  const json = parseJson(text);
  if (!json) return [];
  const names: string[] = [];
  for (const key of ['dependencies', 'devDependencies']) {
    const block = json[key];
    if (block && typeof block === 'object') names.push(...Object.keys(block));
  }
  return names;
}

function packageScripts(text: string): string[] {
  const scripts = parseJson(text)?.scripts;
  return scripts && typeof scripts === 'object' ? Object.keys(scripts) : [];
}

const DEP_STACK: Record<string, string> = {
  fastify: 'Fastify',
  next: 'Next.js',
  react: 'React',
  express: 'Express',
  '@nestjs/core': 'NestJS',
  vue: 'Vue',
  svelte: 'Svelte',
  'drizzle-orm': 'Drizzle ORM',
  prisma: 'Prisma',
  zod: 'Zod',
  vitest: 'Vitest',
  tailwindcss: 'Tailwind CSS',
};

const FILE_STACK: Record<string, string> = {
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'Yarn',
  'package-lock.json': 'npm',
  'tsconfig.json': 'TypeScript',
  Dockerfile: 'Docker',
  Makefile: 'Make',
  'pyproject.toml': 'Python',
  'requirements.txt': 'Python',
  'go.mod': 'Go',
  'Cargo.toml': 'Rust',
};

/** AC-8: stack items from manifests at the root and one level below, each with its evidence path. */
export function detectStack(manifests: readonly ManifestFile[]): StackItem[] {
  const out: StackItem[] = [];
  const seen = new Set<string>();
  const add = (name: string, evidence_path: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    out.push({ name, evidence_path });
  };
  for (const m of nearManifests(manifests)) {
    const name = baseName(m.path);
    if (name === 'package.json') {
      add('Node.js/TypeScript', m.path);
      const deps = new Set(packageDeps(m.text));
      for (const [dep, label] of Object.entries(DEP_STACK)) if (deps.has(dep)) add(label, m.path);
    } else if (isComposeFile(name)) {
      add('Docker Compose', m.path);
    } else if (FILE_STACK[name]) {
      add(FILE_STACK[name]!, m.path);
    }
  }
  return out;
}

function isExcludedDir(segment: string): boolean {
  const lower = segment.toLowerCase();
  return EXCLUDED_DIRS.some((d) => d === lower);
}

/** AC-9: directories to depth 2 with their indexed-file count (nested files count toward each ancestor). */
export function buildStructure(filePaths: readonly string[]): StructureItem[] {
  const counts = new Map<string, number>();
  for (const file of filePaths) {
    const dirs = file.split('/').slice(0, -1);
    if (dirs.some(isExcludedDir)) continue;
    for (let depth = 1; depth <= Math.min(STRUCTURE_MAX_DEPTH, dirs.length); depth++) {
      const dir = dirs.slice(0, depth).join('/');
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([path, files]) => ({ path, files }))
    .sort((a, b) => b.files - a.files || byPath(a.path, b.path))
    .slice(0, STRUCTURE_MAX_ENTRIES);
}

/** AC-10: routes ordered by the declaring file's score, then path; capped. */
export function buildRoutes(
  endpoints: readonly RouteItem[],
  scoreByFile: ReadonlyMap<string, number>,
): RouteItem[] {
  return [...endpoints]
    .sort(
      (a, b) =>
        (scoreByFile.get(b.file) ?? 0) - (scoreByFile.get(a.file) ?? 0) ||
        byPath(a.file, b.file) ||
        byPath(a.path, b.path) ||
        byPath(a.method, b.method),
    )
    .slice(0, ROUTES_MAX);
}

/** Top-level `services:` keys (2- or 4-space indent) and their `image:` values; bounded, no YAML parser. */
export function parseComposeServices(text: string): Array<{ name: string; image: string | null }> {
  const lines = text.slice(0, PARSE_INPUT_MAX_CHARS).split(/\r?\n/);
  const out: Array<{ name: string; image: string | null }> = [];
  let inServices = false;
  let keyIndent = -1;
  let current: { name: string; image: string | null } | null = null;
  for (const raw of lines) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      inServices = /^services:\s*(#.*)?$/.test(raw);
      current = null;
      continue;
    }
    if (!inServices) continue;
    const indent = raw.length - raw.trimStart().length;
    if (keyIndent < 0) keyIndent = indent;
    if (indent === keyIndent) {
      const m = /^\s+([A-Za-z0-9_.-]+):/.exec(raw);
      current = m ? { name: m[1]!, image: null } : null;
      if (current) out.push(current);
    } else if (current && indent > keyIndent) {
      const m = /^\s+image:\s*["']?([^\s"'#]+)/.exec(raw);
      if (m && current.image === null) current.image = m[1]!;
    }
  }
  return out;
}

function imageName(image: string): string {
  const last = image.slice(image.lastIndexOf('/') + 1);
  return last.split(/[:@]/)[0]!.toLowerCase();
}

function looksLikeDataStore(name: string): boolean {
  const lower = name.toLowerCase();
  return DATA_STORE_PREFIXES.some((p) => lower.startsWith(p));
}

/** D4: data-store services of a compose file (by service name or image name), in file order. */
export function composeDataStores(text: string): string[] {
  return parseComposeServices(text)
    .filter((s) => looksLikeDataStore(s.name) || (s.image !== null && looksLikeDataStore(imageName(s.image))))
    .map((s) => s.name);
}

/** Makefile target names only (never recipes), bounded. */
export function parseMakeTargets(text: string): string[] {
  const out: string[] = [];
  for (const line of text.slice(0, PARSE_INPUT_MAX_CHARS).split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_.-]+)\s*:(?!=)/.exec(line);
    if (m && !m[1]!.startsWith('.') && !out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

type PackageManager = 'pnpm' | 'yarn' | 'npm';

function detectPackageManager(manifests: readonly ManifestFile[]): { pm: PackageManager; source: string | null } {
  const root = new Map(manifests.filter((m) => depthOf(m.path) === 0).map((m) => [m.path, m]));
  if (root.has('pnpm-lock.yaml')) return { pm: 'pnpm', source: 'pnpm-lock.yaml' };
  if (root.has('yarn.lock')) return { pm: 'yarn', source: 'yarn.lock' };
  return { pm: 'npm', source: root.has('package-lock.json') ? 'package-lock.json' : null };
}

function scriptCommand(pm: PackageManager, script: string): string {
  return pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`;
}

/** AC-11: install, env copy, compose up, dev/start — in that order, only with evidence. Script names only. */
export function buildRunLocally(manifests: readonly ManifestFile[]): RunLocallyItem[] {
  const near = nearManifests(manifests);
  const { pm, source } = detectPackageManager(near);
  const out: RunLocallyItem[] = [];

  const rootPkg = near.find((m) => m.path === 'package.json');
  const subPkgs = near.filter((m) => depthOf(m.path) === 1 && baseName(m.path) === 'package.json');
  const makefile = near.find((m) => baseName(m.path) === 'Makefile');
  const makeTargets = makefile ? parseMakeTargets(makefile.text) : [];

  if (rootPkg || subPkgs.length > 0) {
    out.push({ command: `${pm} install`, source_path: source ?? (rootPkg ?? subPkgs[0]!).path });
  } else if (makefile) {
    const t = makeTargets.find((n) => n === 'install' || n === 'setup');
    if (t) out.push({ command: `make ${t}`, source_path: makefile.path });
  }

  for (const m of near) {
    if (baseName(m.path) !== '.env.example') continue;
    const dir = m.path.slice(0, m.path.length - '.env.example'.length);
    out.push({ command: `cp ${dir}.env.example ${dir}.env`, source_path: m.path });
  }

  for (const m of near) {
    if (!isComposeFile(baseName(m.path))) continue;
    const services = composeDataStores(m.text).filter((s) => SAFE_NAME.test(s));
    if (services.length > 0) {
      out.push({ command: `docker compose up -d ${services.join(' ')}`, source_path: m.path });
      break;
    }
  }

  const pkgs = [...(rootPkg ? [rootPkg] : []), ...subPkgs];
  let ran = false;
  for (const script of ['dev', 'start']) {
    const pkg = pkgs.find((p) => packageScripts(p.text).includes(script));
    if (!pkg) continue;
    const dir = pkg.path.includes('/') ? pkg.path.slice(0, pkg.path.lastIndexOf('/')) : null;
    const cmd = scriptCommand(pm, script);
    out.push({ command: dir ? `cd ${dir} && ${cmd}` : cmd, source_path: pkg.path });
    ran = true;
    break;
  }
  if (!ran && makefile) {
    const t = ['dev', 'run', 'start', 'serve', 'up'].find((n) => makeTargets.includes(n));
    if (t) out.push({ command: `make ${t}`, source_path: makefile.path });
  }
  return out;
}

/** D2: churn needs history beyond the single (boundary) commit. */
export function hasHotnessHistory(commits: number): boolean {
  return commits > HOTNESS_MIN_COMMITS;
}

/** D2: the hotness window opens this many days before the committer date of `source_sha`. */
export function hotnessWindowStart(sourceCommitDate: Date): Date {
  return new Date(sourceCommitDate.getTime() - HOTNESS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * AC-12/F10: hotness = commit count / max count, with the max taken over the
 * candidate set (ranked, non-junk files) only. 0 when the max is 0.
 */
export function computeHotness(
  commitCounts: ReadonlyMap<string, number>,
  candidatePaths: readonly string[],
): Map<string, number> {
  let max = 0;
  for (const p of candidatePaths) max = Math.max(max, commitCounts.get(p) ?? 0);
  return new Map(candidatePaths.map((p) => [p, max > 0 ? (commitCounts.get(p) ?? 0) / max : 0]));
}

/** AC-21: the deterministic one-line reason. */
export function computedReason(importedBy: number, percentile: number): string {
  return `imported by ${importedBy} files · rank p${Math.round(percentile)}`;
}

/**
 * Score every non-junk ranked file: `pagerank × (1 + hotness)`, ordered by
 * score desc then path. `commitCounts: null` means no churn (hotness 0).
 */
export function scoreCandidates(
  ranked: readonly RankedFile[],
  commitCounts: ReadonlyMap<string, number> | null,
): ScoredFile[] {
  const candidates = ranked.filter((f) => !isJunkPath(f.path));
  const hot = computeHotness(commitCounts ?? new Map(), candidates.map((f) => f.path));
  return candidates
    .map((f) => {
      const hotness = hot.get(f.path) ?? 0;
      return { ...f, hotness, score: f.pagerank * (1 + hotness) };
    })
    .sort((a, b) => b.score - a.score || byPath(a.path, b.path));
}

/** AC-12: top 8 of the scored candidates. */
export function rankReadingPath(scored: readonly ScoredFile[]): ReadingPathItem[] {
  return scored.slice(0, READING_PATH_MAX).map((f) => ({
    path: f.path,
    score: f.score,
    pagerank: f.pagerank,
    hotness: f.hotness,
    computed_reason: computedReason(f.importedBy, f.percentile),
  }));
}

/**
 * AC-14/F19: seeds are the top scored files; from each, follow the best-scored
 * unvisited non-junk import target for up to CRITICAL_PATH_CHAIN_DEPTH hops
 * (junk targets are skipped when picking the next hop). Route files join;
 * result is de-duplicated, ordered by score then path, capped at 6.
 */
export function selectCriticalPaths(
  scored: readonly ScoredFile[],
  imports: ReadonlyMap<string, readonly string[]>,
  routeFiles: readonly string[],
): CriticalPathItem[] {
  const byFile = new Map(scored.map((f) => [f.path, f]));
  const picked = new Set<string>();

  for (const seed of scored.slice(0, CRITICAL_PATH_SEEDS)) {
    picked.add(seed.path);
    let current = seed.path;
    for (let hop = 0; hop < CRITICAL_PATH_CHAIN_DEPTH; hop++) {
      const next = (imports.get(current) ?? [])
        .filter((t) => !isJunkPath(t) && !picked.has(t))
        .map((t) => byFile.get(t))
        .filter((f): f is ScoredFile => f !== undefined)
        .sort((a, b) => b.score - a.score || byPath(a.path, b.path))[0];
      if (!next) break;
      picked.add(next.path);
      current = next.path;
    }
  }
  for (const f of routeFiles) if (!isJunkPath(f)) picked.add(f);

  return [...picked]
    .map((path) => ({ path, file: byFile.get(path) }))
    .sort((a, b) => (b.file?.score ?? 0) - (a.file?.score ?? 0) || byPath(a.path, b.path))
    .slice(0, CRITICAL_PATHS_MAX)
    .map(({ path, file }) => ({
      path,
      computed_reason: file ? computedReason(file.importedBy, file.percentile) : 'declares routes',
    }));
}
