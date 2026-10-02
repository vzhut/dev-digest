import { lstat, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { dirname, join, matchesGlob, sep } from 'node:path';
import type { DocStat, ProjectDocReadResult, ProjectDocWriteResult, ProjectDocs } from './index.js';

/** Lower-case: macOS volumes are case-insensitive, so `.GIT` is `.git`. */
const SKIPPED_DIRS = new Set(['.git', 'node_modules']);

/** A path segment naming a skipped directory (any letter case) — never read or written. */
function inSkippedDir(p: string): boolean {
  return p.split('/').some((seg) => SKIPPED_DIRS.has(seg.toLowerCase()));
}
/** Files read in parallel while listing (bounds open file descriptors). */
const READ_CONCURRENCY = 64;

/** Same rules as the `ContextPath` contract; re-checked here so the adapter is safe on its own. */
function pathLooksUnsafe(p: string): boolean {
  if (p.length === 0 || p.length > 512 || !p.endsWith('.md')) return true;
  if (p.startsWith('/') || p.includes('\\') || p.includes('"')) return true;
  if (/[\u0000-\u001f\u007f]/.test(p)) return true;
  return p.split('/').some((s) => s === '' || s === '.' || s === '..');
}

function decode(buf: Buffer): string {
  // Non-fatal: invalid UTF-8 becomes U+FFFD.
  return new TextDecoder('utf-8').decode(buf);
}

/**
 * Walks the working tree of a clone. Symlinks are never followed (files or
 * directories), `.git` / `node_modules` are skipped, and every file's realpath
 * must stay under the clone's realpath.
 */
export class FsProjectDocs implements ProjectDocs {
  async list(cloneDir: string, roots: string[]): Promise<DocStat[]> {
    let base: string;
    try {
      base = await realpath(cloneDir);
    } catch {
      return [];
    }
    const candidates: string[] = [];
    await this.walk(base, '', roots, candidates);
    candidates.sort();

    const out: DocStat[] = [];
    for (let i = 0; i < candidates.length; i += READ_CONCURRENCY) {
      const batch = candidates.slice(i, i + READ_CONCURRENCY);
      const results = await Promise.all(batch.map((rel) => this.statAndRead(base, rel)));
      for (const r of results) if (r) out.push(r);
    }
    return out;
  }

  async read(cloneDir: string, path: string): Promise<ProjectDocReadResult> {
    if (pathLooksUnsafe(path) || inSkippedDir(path)) return { status: 'missing', reason: 'outside clone' };
    let base: string;
    try {
      base = await realpath(cloneDir);
    } catch {
      return { status: 'missing', reason: 'not found' };
    }
    const full = join(base, ...path.split('/'));
    try {
      const l = await lstat(full);
      if (l.isSymbolicLink()) return { status: 'missing', reason: 'outside clone' };
      const real = await realpath(full);
      if (!real.startsWith(base + sep)) return { status: 'missing', reason: 'outside clone' };
      if (!l.isFile()) return { status: 'missing', reason: 'unreadable' };
      const buf = await readFile(real);
      return { status: 'ok', text: decode(buf), bytes: buf.byteLength };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      return { status: 'missing', reason: code === 'ENOENT' || code === 'ENOTDIR' ? 'not found' : 'unreadable' };
    }
  }

  async exists(cloneDir: string): Promise<boolean> {
    try {
      return (await stat(cloneDir)).isDirectory();
    } catch {
      return false;
    }
  }

  async write(cloneDir: string, path: string, content: string): Promise<ProjectDocWriteResult> {
    if (pathLooksUnsafe(path) || inSkippedDir(path)) return { status: 'missing', reason: 'outside clone' };
    let base: string;
    try {
      base = await realpath(cloneDir);
    } catch {
      return { status: 'missing', reason: 'not found' };
    }
    const full = join(base, ...path.split('/'));
    let tmp: string | undefined;
    try {
      const l = await lstat(full);
      if (l.isSymbolicLink()) return { status: 'missing', reason: 'outside clone' };
      // base is already a realpath, so any symlinked component (file or parent) changes the result.
      const real = await realpath(full);
      if (real !== full) return { status: 'missing', reason: 'outside clone' };
      if (!l.isFile()) return { status: 'missing', reason: 'unreadable' };
      const data = Buffer.from(content, 'utf8');
      tmp = join(dirname(full), `.${randomUUID()}.devdigest-tmp`);
      await writeFile(tmp, data, { flag: 'wx', mode: l.mode & 0o777 });
      await rename(tmp, full);
      tmp = undefined;
      return { status: 'ok', sizeBytes: data.byteLength };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      return { status: 'missing', reason: code === 'ENOENT' || code === 'ENOTDIR' ? 'not found' : 'unreadable' };
    } finally {
      if (tmp) await rm(tmp, { force: true }).catch(() => undefined);
    }
  }

  private async walk(base: string, rel: string, roots: string[], out: string[]): Promise<void> {
    let entries: Dirent[];
    try {
      entries = (await readdir(rel ? join(base, rel) : base, { withFileTypes: true })) as Dirent[];
    } catch {
      return; // unreadable directory: skip, keep listing the rest
    }
    const subdirs: string[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name.toLowerCase())) subdirs.push(childRel);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        if (roots.some((r) => matchesGlob(childRel, r))) out.push(childRel);
      }
    }
    for (const d of subdirs) await this.walk(base, d, roots, out);
  }

  private async statAndRead(base: string, rel: string): Promise<DocStat | null> {
    const full = join(base, ...rel.split('/'));
    try {
      const real = await realpath(full);
      if (!real.startsWith(base + sep)) return null;
      const [st, buf] = await Promise.all([stat(real), readFile(real)]);
      return { path: rel, sizeBytes: st.size, mtime: st.mtime, text: decode(buf) };
    } catch {
      return null;
    }
  }
}
