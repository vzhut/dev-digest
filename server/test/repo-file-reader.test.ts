import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitRepoFileReader } from '../src/adapters/git/repo-file-reader.js';

const repo = { owner: 'acme', name: 'r' };
let root: string;
let reader: GitRepoFileReader;
let sha: string;

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'intent-reader-'));
  const dir = join(root, 'acme', 'r');
  mkdirSync(join(dir, 'specs'), { recursive: true });
  git(root, 'init', dir);
  writeFileSync(join(dir, 'specs', 'a.md'), '# Spec\nrate limit');
  writeFileSync(join(dir, 'bin.md'), Buffer.from([0x23, 0x00, 0x01]));
  // Symlinks that point OUTSIDE the clone (file and directory).
  writeFileSync(join(root, 'outside.md'), 'TOP SECRET');
  symlinkSync(join(root, 'outside.md'), join(dir, 'link.md'));
  mkdirSync(join(root, 'outside-dir'));
  writeFileSync(join(root, 'outside-dir', 'x.md'), 'TOP SECRET');
  symlinkSync(join(root, 'outside-dir'), join(dir, 'linkdir'));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-m', 'init');
  sha = git(dir, 'rev-parse', 'HEAD');
  reader = new GitRepoFileReader((r) => join(root, r.owner, r.name));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('GitRepoFileReader', () => {
  it('reads a regular file at a commit, falling back through refs', async () => {
    expect(await reader.read(repo, 'specs/a.md', [sha])).toEqual({ status: 'ok', text: '# Spec\nrate limit' });
    expect(await reader.read(repo, 'specs/a.md', ['deadbeefdeadbeef', 'HEAD'])).toMatchObject({ status: 'ok' });
  });

  it('never follows a symlink out of the clone (file or directory)', async () => {
    expect(await reader.read(repo, 'link.md', ['HEAD'])).toEqual({ status: 'blocked', reason: 'symlink not followed' });
    const viaDir = await reader.read(repo, 'linkdir/x.md', ['HEAD']);
    expect(viaDir.status).toBe('missing');
    expect(JSON.stringify(viaDir)).not.toContain('SECRET');
  });

  it('rejects unsafe paths and unknown refs without spawning git on them', async () => {
    expect(await reader.read(repo, '../outside.md', ['HEAD'])).toMatchObject({ status: 'blocked' });
    expect(await reader.read(repo, '/etc/passwd', ['HEAD'])).toMatchObject({ status: 'blocked' });
    expect(await reader.read(repo, 'specs/a.md', ['--upload-pack=x'])).toMatchObject({ status: 'missing' });
  });

  it('reports missing / not cloned / binary', async () => {
    expect(await reader.read(repo, 'specs/none.md', ['HEAD'])).toEqual({ status: 'missing', reason: 'not found' });
    expect(await reader.read(repo, 'specs', ['HEAD'])).toMatchObject({ status: 'missing' });
    expect(await reader.read({ owner: 'no', name: 'clone' }, 'a.md', ['HEAD'])).toEqual({
      status: 'missing',
      reason: 'repository not cloned',
    });
    expect(await reader.read(repo, 'bin.md', ['HEAD'])).toEqual({ status: 'missing', reason: 'not a text file' });
  });
});
