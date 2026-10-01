import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** `listFiles` stops here and reports `truncated: true`. */
export const MAX_SNAPSHOT_FILES = 200_000;
const GIT_TIMEOUT_MS = 10_000;
const LIST_TIMEOUT_MS = 30_000;
const CHURN_TIMEOUT_MS = 30_000;
/** `git log --name-only` over 180 days of a busy repo; far above any realistic output. */
const CHURN_MAX_BUFFER = 64 * 1024 * 1024;

export type SnapshotFileResult =
  | { status: 'ok'; text: string }
  | { status: 'missing' | 'blocked'; reason: string };

export interface SnapshotChurn {
  /** Non-boundary commits counted in the window (shallow-boundary commits excluded). */
  commits: number;
  /** path -> number of counted commits that touched it. */
  counts: Map<string, number>;
}

/**
 * Port: read-only, deterministic views of a clone at ONE commit (git blobs, never the
 * working tree). Local port (like `RepoFileReader`) — the repo-intel facade depends on
 * this type only. Every method resolves to a neutral value on git failure (no raw error
 * text is ever surfaced).
 */
export interface RepoSnapshot {
  /** Current `HEAD` sha of the clone, or `null` when it is not a usable repository. */
  headSha(cloneDir: string): Promise<string | null>;
  /** Committer date of `sha`, or `null` when unknown. */
  commitDate(cloneDir: string, sha: string): Promise<Date | null>;
  /** Every committed path at `sha` (capped; `truncated` is set when the cap was hit). */
  listFiles(cloneDir: string, sha: string): Promise<{ files: string[]; truncated: boolean }>;
  /** One regular text file at `sha`; symlinks and unsafe paths are `blocked`. */
  readText(cloneDir: string, sha: string, path: string, maxBytes: number): Promise<SnapshotFileResult>;
  /** Commits per file reachable from `sha` since `since`. */
  churn(cloneDir: string, sha: string, since: Date): Promise<SnapshotChurn>;
}

const REF_RE = /^(?:HEAD|[0-9a-f]{7,40})$/i;

/** Same guard as `GitRepoFileReader` (`repo-file-reader.ts`). */
function pathLooksUnsafe(p: string): boolean {
  if (p.length === 0 || p.includes('\0') || p.includes('\\') || p.startsWith('/') || p.startsWith('-')) return true;
  return p.split('/').some((s) => s === '' || s === '.' || s === '..');
}

const BASE_ARGS = ['-c', 'core.quotePath=false'];

/** `git -C <cwd> …` with execFile (no shell). `null` on any failure. */
async function git(cwd: string, args: string[], maxBuffer: number, timeout = GIT_TIMEOUT_MS): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', [...BASE_ARGS, '-C', cwd, ...args], { timeout, maxBuffer });
    return stdout;
  } catch {
    return null;
  }
}

/** Shas listed in the clone's `shallow` file (grafted history boundary). */
async function shallowBoundary(cwd: string): Promise<Set<string>> {
  const out = await git(cwd, ['rev-parse', '--git-path', 'shallow'], 4096);
  if (out === null) return new Set();
  const rel = out.trim();
  if (!rel) return new Set();
  try {
    const text = await readFile(isAbsolute(rel) ? rel : join(cwd, rel), 'utf8');
    return new Set(text.split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}

export class GitRepoSnapshot implements RepoSnapshot {
  async headSha(cloneDir: string): Promise<string | null> {
    const out = await git(cloneDir, ['rev-parse', '--verify', 'HEAD'], 1024);
    const sha = out?.trim() ?? '';
    return /^[0-9a-f]{40,64}$/i.test(sha) ? sha : null;
  }

  async commitDate(cloneDir: string, sha: string): Promise<Date | null> {
    if (!REF_RE.test(sha)) return null;
    const out = await git(cloneDir, ['show', '-s', '--format=%ct', sha, '--'], 1024);
    const secs = Number(out?.trim());
    return Number.isFinite(secs) && out?.trim() ? new Date(secs * 1000) : null;
  }

  /** Streams `ls-tree` so a huge tree never hits a buffer limit; stops at the cap. */
  listFiles(cloneDir: string, sha: string): Promise<{ files: string[]; truncated: boolean }> {
    if (!REF_RE.test(sha)) return Promise.resolve({ files: [], truncated: false });
    return new Promise((resolve) => {
      const child = spawn('git', [...BASE_ARGS, '-C', cloneDir, 'ls-tree', '-r', '-z', '--name-only', sha, '--'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const files: string[] = [];
      let rest = '';
      let truncated = false;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ files, truncated });
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
      }, LIST_TIMEOUT_MS);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        if (truncated) return;
        rest += chunk;
        const parts = rest.split('\0');
        rest = parts.pop() ?? '';
        for (const p of parts) {
          if (!p) continue;
          if (files.length >= MAX_SNAPSHOT_FILES) {
            truncated = true;
            child.kill('SIGKILL');
            return;
          }
          files.push(p);
        }
      });
      child.on('error', () => {
        files.length = 0;
        finish();
      });
      child.on('close', (code) => {
        if (!truncated && rest) {
          if (files.length >= MAX_SNAPSHOT_FILES) truncated = true;
          else files.push(rest);
        }
        // A failed/timed-out listing with no usable output is empty and NOT truncated.
        if (!truncated && code !== 0) files.length = 0;
        finish();
      });
    });
  }

  async readText(cloneDir: string, sha: string, path: string, maxBytes: number): Promise<SnapshotFileResult> {
    if (!REF_RE.test(sha)) return { status: 'blocked', reason: 'invalid ref' };
    if (pathLooksUnsafe(path)) return { status: 'blocked', reason: 'unsafe path' };
    const listing = await git(cloneDir, ['ls-tree', '-l', '-z', sha, '--', path], 64 * 1024);
    if (listing === null) return { status: 'missing', reason: 'unavailable' };
    // `<mode> <type> <sha> <size>\t<path>` (NUL-terminated); the entry must be exactly our path.
    for (const entry of listing.split('\0')) {
      const tab = entry.indexOf('\t');
      if (tab === -1 || entry.slice(tab + 1) !== path) continue;
      const [mode, type, blob, size] = entry.slice(0, tab).trim().split(/\s+/);
      if (mode === '120000') return { status: 'blocked', reason: 'symlink not followed' };
      if (type !== 'blob' || (mode !== '100644' && mode !== '100755')) {
        return { status: 'missing', reason: 'not a regular file' };
      }
      if (!blob || !/^[0-9a-f]{40,64}$/i.test(blob)) return { status: 'missing', reason: 'unavailable' };
      if (Number(size) > maxBytes) return { status: 'missing', reason: 'file too large' };
      const text = await git(cloneDir, ['cat-file', 'blob', blob], maxBytes + 1024);
      if (text === null) return { status: 'missing', reason: 'unavailable' };
      if (text.includes('\0')) return { status: 'missing', reason: 'not a text file' };
      return { status: 'ok', text };
    }
    return { status: 'missing', reason: 'not found' };
  }

  async churn(cloneDir: string, sha: string, since: Date): Promise<SnapshotChurn> {
    const counts = new Map<string, number>();
    if (!REF_RE.test(sha) || Number.isNaN(since.getTime())) return { commits: 0, counts };
    const out = await git(
      cloneDir,
      [
        'log',
        '-z',
        '--no-renames',
        `--since=${since.toISOString()}`,
        '--format=%x01%H',
        '--name-only',
        sha,
        '--',
      ],
      CHURN_MAX_BUFFER,
      CHURN_TIMEOUT_MS,
    );
    if (out === null) return { commits: 0, counts };
    const boundary = await shallowBoundary(cloneDir);
    let commits = 0;
    let skipping = false;
    // With `-z` every token is NUL-terminated: `\x01<sha>\n<first path>` opens a commit, the
    // following tokens are its remaining paths.
    for (const token of out.split('\0')) {
      if (!token) continue;
      let path = token;
      if (token.startsWith('\x01')) {
        const nl = token.indexOf('\n');
        const hash = (nl === -1 ? token.slice(1) : token.slice(1, nl)).trim().toLowerCase();
        skipping = boundary.has(hash);
        if (!skipping) commits += 1;
        path = nl === -1 ? '' : token.slice(nl + 1);
      }
      path = path.replace(/^\n+/, '');
      if (skipping || !path) continue;
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
    return { commits, counts };
  }
}
