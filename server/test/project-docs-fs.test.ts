import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Passthrough wrapper so one test can force `rename` to fail after the temp file exists.
const renameControl = vi.hoisted(() => ({ fail: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...real,
    rename: (async (...args: Parameters<typeof real.rename>) => {
      if (renameControl.fail) throw Object.assign(new Error('forced'), { code: 'EIO' });
      return real.rename(...args);
    }) as typeof real.rename,
  };
});
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { FsProjectDocs } from '../src/adapters/project-docs/fs.js';

const DEFAULT_ROOTS = ['**/{specs,docs,insights}/**/*.md'];

let dir: string;
let outside: string;
const docs = new FsProjectDocs();

async function put(rel: string, content: string | Buffer = '# x') {
  const full = join(dir, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pd-clone-'));
  outside = await mkdtemp(join(tmpdir(), 'pd-out-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('FsProjectDocs.list', () => {
  it('matches the default glob, nested docs, and skips symlinks / node_modules / .git', async () => {
    await put('specs/a.md');
    await put('docs/x/b.md');
    await put('insights/c.md');
    await put('src/d.md');
    await put('packages/x/docs/y.md');
    await put('node_modules/x/docs/y.md');
    await put('.git/docs/z.md');
    await writeFile(join(outside, 'secret.md'), 'secret');
    await mkdir(join(dir, 'docs'), { recursive: true });
    await symlink(join(outside, 'secret.md'), join(dir, 'docs/link.md'));
    await symlink(outside, join(dir, 'specs/linkdir'));

    const list = await docs.list(dir, DEFAULT_ROOTS);
    expect(list.map((d) => d.path)).toEqual([
      'docs/x/b.md',
      'insights/c.md',
      'packages/x/docs/y.md',
      'specs/a.md',
    ]);
    expect(list[0]).toMatchObject({ sizeBytes: 3, text: '# x' });
    expect(list[0]!.mtime).toBeInstanceOf(Date);
  });

  it('honours custom roots', async () => {
    await put('docs/a.md');
    await put('arch/adr/1.md');
    await put('arch/other/2.md');
    const list = await docs.list(dir, ['**/adr/**/*.md']);
    expect(list.map((d) => d.path)).toEqual(['arch/adr/1.md']);
  });

  it('decodes non-UTF-8 bytes with replacement characters', async () => {
    await put('docs/bad.md', Buffer.from([0x61, 0xff, 0x62]));
    const [d] = await docs.list(dir, DEFAULT_ROOTS);
    expect(d!.text).toBe('a�b');
  });

  it('returns [] for a missing clone dir', async () => {
    expect(await docs.list(join(dir, 'nope'), DEFAULT_ROOTS)).toEqual([]);
  });

  it('lists 10,000 generated files within 2 seconds', async () => {
    for (let d = 0; d < 100; d++) {
      const sub = join(dir, 'docs', `d${d}`);
      await mkdir(sub, { recursive: true });
      await Promise.all(Array.from({ length: 100 }, (_, i) => writeFile(join(sub, `f${i}.md`), `# ${d}-${i}`)));
    }
    // Best of 3 so a loaded machine does not flake; a real regression is slow on every run.
    let best = Infinity;
    let count = 0;
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      const list = await docs.list(dir, DEFAULT_ROOTS);
      best = Math.min(best, performance.now() - t0);
      count = list.length;
    }
    expect(count).toBe(10_000);
    expect(best).toBeLessThan(2000);
  }, 30_000);
});

describe('FsProjectDocs.read', () => {
  it('reads an included file with its byte size', async () => {
    await put('docs/a.md', 'héllo');
    expect(await docs.read(dir, 'docs/a.md')).toEqual({ status: 'ok', text: 'héllo', bytes: 6 });
  });

  it('reports traversal and symlinks as outside clone, absent as not found', async () => {
    await writeFile(join(outside, 'secret.md'), 'secret');
    await mkdir(join(dir, 'docs'), { recursive: true });
    await symlink(join(outside, 'secret.md'), join(dir, 'docs/link.md'));
    await symlink(outside, join(dir, 'docs/linkdir'));

    expect(await docs.read(dir, '../x.md')).toEqual({ status: 'missing', reason: 'outside clone' });
    expect(await docs.read(dir, 'docs/link.md')).toEqual({ status: 'missing', reason: 'outside clone' });
    expect(await docs.read(dir, 'docs/linkdir/secret.md')).toEqual({ status: 'missing', reason: 'outside clone' });
    expect(await docs.read(dir, 'docs/absent.md')).toEqual({ status: 'missing', reason: 'not found' });
  });

  it('reports a directory named *.md as unreadable', async () => {
    await mkdir(join(dir, 'docs/odd.md'), { recursive: true });
    expect(await docs.read(dir, 'docs/odd.md')).toEqual({ status: 'missing', reason: 'unreadable' });
  });
});

describe('FsProjectDocs.write / exists', () => {
  it('replaces an existing file atomically as UTF-8 and leaves no extra file', async () => {
    await put('docs/a.md', 'old');
    await put('docs/other.md', 'keep');
    const res = await docs.write(dir, 'docs/a.md', 'héllo');
    expect(res).toEqual({ status: 'ok', sizeBytes: 6 });
    expect(await readFile(join(dir, 'docs/a.md'), 'utf8')).toBe('héllo');
    expect(await readFile(join(dir, 'docs/other.md'), 'utf8')).toBe('keep');
    expect((await readdir(join(dir, 'docs'))).sort()).toEqual(['a.md', 'other.md']);
  });

  it('never creates a file, and refuses traversal, symlinks, symlinked parents and directories', async () => {
    await writeFile(join(outside, 'secret.md'), 'secret');
    await mkdir(join(dir, 'docs'), { recursive: true });
    await symlink(join(outside, 'secret.md'), join(dir, 'docs/link.md'));
    await symlink(outside, join(dir, 'docs/linkdir'));
    await mkdir(join(dir, 'docs/odd.md'), { recursive: true });

    expect(await docs.write(dir, 'docs/new.md', 'x')).toEqual({ status: 'missing', reason: 'not found' });
    expect(await readdir(join(dir, 'docs'))).not.toContain('new.md');
    expect(await docs.write(dir, '../x.md', 'x')).toEqual({ status: 'missing', reason: 'outside clone' });
    expect(await docs.write(dir, 'docs/link.md', 'x')).toEqual({ status: 'missing', reason: 'outside clone' });
    expect(await docs.write(dir, 'docs/linkdir/secret.md', 'x')).toEqual({ status: 'missing', reason: 'outside clone' });
    expect(await docs.write(dir, 'docs/odd.md', 'x')).toEqual({ status: 'missing', reason: 'unreadable' });
    expect(await readFile(join(outside, 'secret.md'), 'utf8')).toBe('secret');
    expect(await readdir(outside)).toEqual(['secret.md']);
  });

  it('exists is true only for an existing directory', async () => {
    expect(await docs.exists(dir)).toBe(true);
    expect(await docs.exists(join(dir, 'nope'))).toBe(false);
  });
});

describe('FsProjectDocs skipped directories (any letter case) and temp cleanup', () => {
  it('read and write refuse .git / node_modules in any case, nested too, and write nothing', async () => {
    for (const rel of ['.GIT/a.md', 'Node_Modules/x.md', 'a/.Git/b.md', '.git/c.md']) {
      await put(rel, 'original');
      expect(await docs.read(dir, rel)).toEqual({ status: 'missing', reason: 'outside clone' });
      expect(await docs.write(dir, rel, 'changed')).toEqual({ status: 'missing', reason: 'outside clone' });
      expect(await readFile(join(dir, rel), 'utf8')).toBe('original');
    }
  });

  it('list skips differently-cased skipped dirs even with a broad root', async () => {
    await put('.GIT/a.md');
    await put('Node_Modules/x.md');
    await put('docs/ok.md');
    expect((await docs.list(dir, ['**/*.md'])).map((d) => d.path)).toEqual(['docs/ok.md']);
  });

  it('leaves no temp file behind when the rename fails', async () => {
    await put('docs/a.md', 'old');
    renameControl.fail = true;
    try {
      expect(await docs.write(dir, 'docs/a.md', 'new')).toEqual({ status: 'missing', reason: 'unreadable' });
    } finally {
      renameControl.fail = false;
    }
    expect(await readdir(join(dir, 'docs'))).toEqual(['a.md']);
    expect(await readFile(join(dir, 'docs/a.md'), 'utf8')).toBe('old');
  });
});
