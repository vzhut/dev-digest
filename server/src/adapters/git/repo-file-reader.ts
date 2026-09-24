import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RepoRef } from '@devdigest/shared';

const execFileAsync = promisify(execFile);

/** Blobs larger than this are reported missing rather than read. */
const MAX_BLOB_BYTES = 256 * 1024;
const GIT_TIMEOUT_MS = 5_000;

export type RepoFileResult =
  | { status: 'ok'; text: string }
  | { status: 'missing' | 'blocked'; reason: string };

/**
 * Port: read ONE plain-text file from a cloned repo at a commit. Local port
 * (like `Tokenizer` / `DepGraph`) — the intent module depends on this type only.
 */
export interface RepoFileReader {
  /** `refs` are tried in order (commit sha or `HEAD`). */
  read(repo: RepoRef, path: string, refs: string[]): Promise<RepoFileResult>;
}

const REF_RE = /^(?:HEAD|[0-9a-f]{7,40})$/i;

/** Defensive re-check; the caller's `isSafeRepoPath` is the primary gate. */
function pathLooksUnsafe(p: string): boolean {
  if (p.length === 0 || p.includes('\0') || p.includes('\\') || p.startsWith('/') || p.startsWith('-')) return true;
  return p.split('/').some((s) => s === '' || s === '.' || s === '..');
}

/**
 * Reads git BLOBS (`git ls-tree` + `git cat-file`), never the working tree.
 * A committed symlink is a mode-120000 blob, so it is reported `blocked`
 * instead of followed, and a path that goes through a symlinked directory does
 * not resolve at all — nothing can escape the clone. Runs `git` with execFile
 * (no shell) and never executes repo code. Error text is never propagated.
 */
export class GitRepoFileReader implements RepoFileReader {
  constructor(private clonePathFor: (repo: RepoRef) => string) {}

  async read(repo: RepoRef, path: string, refs: string[]): Promise<RepoFileResult> {
    if (pathLooksUnsafe(path)) return { status: 'blocked', reason: 'unsafe path' };
    const cwd = this.clonePathFor(repo);
    let sawRepo = false;
    for (const ref of refs) {
      if (!REF_RE.test(ref)) continue;
      let listing: string;
      try {
        const { stdout } = await execFileAsync('git', ['-C', cwd, 'ls-tree', '-l', '-z', ref, '--', path], {
          timeout: GIT_TIMEOUT_MS,
          maxBuffer: 64 * 1024,
        });
        listing = stdout;
        sawRepo = true;
      } catch {
        // Not cloned, or this commit is not in the (shallow) clone: try the next ref.
        continue;
      }
      // `<mode> <type> <sha> <size>\t<path>` (NUL-terminated); the entry must be exactly our path.
      for (const entry of listing.split('\0')) {
        const tab = entry.indexOf('\t');
        if (tab === -1 || entry.slice(tab + 1) !== path) continue;
        const [mode, type, sha, size] = entry.slice(0, tab).trim().split(/\s+/);
        if (mode === '120000') return { status: 'blocked', reason: 'symlink not followed' };
        if (type !== 'blob' || (mode !== '100644' && mode !== '100755')) {
          return { status: 'missing', reason: 'not a regular file' };
        }
        if (!sha || !/^[0-9a-f]{40,64}$/i.test(sha)) return { status: 'missing', reason: 'unavailable' };
        if (Number(size) > MAX_BLOB_BYTES) return { status: 'missing', reason: 'file too large' };
        try {
          const { stdout } = await execFileAsync('git', ['-C', cwd, 'cat-file', 'blob', sha], {
            timeout: GIT_TIMEOUT_MS,
            maxBuffer: MAX_BLOB_BYTES + 1024,
          });
          if (stdout.includes('\0')) return { status: 'missing', reason: 'not a text file' };
          return { status: 'ok', text: stdout };
        } catch {
          return { status: 'missing', reason: 'unavailable' };
        }
      }
    }
    return { status: 'missing', reason: sawRepo ? 'not found' : 'repository not cloned' };
  }
}
