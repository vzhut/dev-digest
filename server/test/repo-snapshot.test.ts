import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitRepoSnapshot, MAX_SNAPSHOT_FILES } from '../src/adapters/git/repo-snapshot.js';

const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'protocol.file.allow=always', ...args],
    { cwd, encoding: 'utf8' },
  ).trim();

const snap = new GitRepoSnapshot();
const LONG_AGO = new Date('2000-01-01T00:00:00Z');
let root: string;
let dir: string;
let sha: string;
let shallow1: string;
let shallow2: string;

function commit(cwd: string, file: string, content: string, msg: string) {
  mkdirSync(join(cwd, file, '..'), { recursive: true });
  writeFileSync(join(cwd, file), content);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', msg);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'repo-snapshot-'));
  dir = join(root, 'full');
  git(root, 'init', dir);
  writeFileSync(join(root, 'secret.txt'), 'TOP SECRET');
  symlinkSync('/etc/hosts', join(dir, 'README.md'));
  writeFileSync(join(dir, 'package.json'), '{"name":"x"}');
  writeFileSync(join(dir, 'bin.dat'), Buffer.from([0x23, 0x00, 0x01]));
  writeFileSync(join(dir, 'big.txt'), 'x'.repeat(5000));
  commit(dir, 'src/a.ts', 'a1', 'c1');
  commit(dir, 'é.ts', 'e1', 'c2');
  commit(dir, 'src/a.ts', 'a2', 'c3');
  sha = git(dir, 'rev-parse', 'HEAD');
  // file:// clones honour --depth (a plain path clone ignores it).
  shallow1 = join(root, 'shallow1');
  shallow2 = join(root, 'shallow2');
  git(root, 'clone', '--depth', '1', `file://${dir}`, shallow1);
  git(root, 'clone', '--depth', '2', `file://${dir}`, shallow2);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('GitRepoSnapshot head/date/list', () => {
  it('reads head sha and committer date, and lists every committed path (unquoted non-ASCII)', async () => {
    expect(await snap.headSha(dir)).toBe(sha);
    expect(await snap.headSha(join(root, 'nope'))).toBeNull();
    expect((await snap.commitDate(dir, sha))?.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(await snap.commitDate(dir, '-x')).toBeNull();
    const { files, truncated } = await snap.listFiles(dir, sha);
    expect(truncated).toBe(false);
    expect([...files].sort()).toEqual(
      ['README.md', 'big.txt', 'bin.dat', 'package.json', 'src/a.ts', 'é.ts'].sort(),
    );
    expect(await snap.listFiles(dir, '--bad')).toEqual({ files: [], truncated: false });
  });

  it('truncates at the cap (never empty) and survives a 40k-path tree', async () => {
    const big = join(root, 'big');
    git(root, 'init', big);
    const empty = execFileSync('git', ['-C', big, 'hash-object', '-w', '--stdin'], { input: '', encoding: 'utf8' }).trim();
    const n = MAX_SNAPSHOT_FILES + 50;
    const lines = Array.from({ length: n }, (_, i) => `100644 blob ${empty}\tf/${i}.txt`);
    execFileSync('git', ['-C', big, 'update-index', '--add', '--index-info'], { input: lines.join('\n') + '\n' });
    const tree = git(big, 'write-tree');
    const c = git(big, 'commit-tree', tree, '-m', 'many');
    const r = await snap.listFiles(big, c);
    expect(r.truncated).toBe(true);
    expect(r.files.length).toBe(MAX_SNAPSHOT_FILES);

    const mid = join(root, 'mid');
    git(root, 'init', mid);
    execFileSync('git', ['-C', mid, 'hash-object', '-w', '--stdin'], { input: '' });
    const midLines = Array.from({ length: 40_000 }, (_, i) => `100644 blob e69de29bb2d1d6434b8b29ae775ad8c2e48c5391\tsome/deeper/dir/file-${i}.txt`);
    execFileSync('git', ['-C', mid, 'update-index', '--add', '--index-info'], { input: midLines.join('\n') + '\n' });
    const mc = git(mid, 'commit-tree', git(mid, 'write-tree'), '-m', 'mid');
    const m = await snap.listFiles(mid, mc);
    expect(m.truncated).toBe(false);
    expect(m.files.length).toBe(40_000);
  }, 60_000);
});

describe('GitRepoSnapshot.readText', () => {
  it('reads blobs; blocks symlinks and unsafe paths; reports missing/oversize/binary', async () => {
    expect((await snap.readText(dir, sha, 'package.json', 1024))).toEqual({ status: 'ok', text: '{"name":"x"}' });
    expect((await snap.readText(dir, sha, 'README.md', 1024)).status).toBe('blocked');
    expect((await snap.readText(dir, sha, '../x', 1024)).status).toBe('blocked');
    expect((await snap.readText(dir, sha, '-x', 1024)).status).toBe('blocked');
    expect((await snap.readText(dir, sha, '/etc/hosts', 1024)).status).toBe('blocked');
    expect((await snap.readText(dir, '--output=x', 'package.json', 1024)).status).toBe('blocked');
    expect((await snap.readText(dir, sha, 'nope.md', 1024)).status).toBe('missing');
    expect((await snap.readText(dir, sha, 'big.txt', 100)).status).toBe('missing');
    expect((await snap.readText(dir, sha, 'bin.dat', 1024)).status).toBe('missing');
    expect((await snap.readText(dir, sha, 'src', 1024)).status).toBe('missing');
  });
});

describe('GitRepoSnapshot.churn', () => {
  it('counts commits per file on a 3-commit history, with non-ASCII paths unquoted', async () => {
    const r = await snap.churn(dir, sha, LONG_AGO);
    // c1 touched README/package.json/bin/big/src/a.ts, c2 é.ts, c3 src/a.ts
    expect(r.commits).toBe(3);
    expect(r.counts.get('src/a.ts')).toBe(2);
    expect(r.counts.get('é.ts')).toBe(1);
    expect(r.counts.get('package.json')).toBe(1);
  });

  it('respects the since window', async () => {
    const r = await snap.churn(dir, sha, new Date(Date.now() + 86_400_000));
    expect(r).toEqual({ commits: 0, counts: new Map() });
  });

  it('excludes the shallow boundary commit: depth 2 gives hotness only for the newer commit', async () => {
    const head = await snap.headSha(shallow2);
    const r = await snap.churn(shallow2, head!, LONG_AGO);
    expect(r.commits).toBe(1);
    expect(r.counts.get('src/a.ts')).toBe(1);
    expect(r.counts.has('package.json')).toBe(false); // only in the boundary commit
  });

  it('depth 1: the only commit is the boundary, so nothing is counted', async () => {
    const head = await snap.headSha(shallow1);
    const r = await snap.churn(shallow1, head!, LONG_AGO);
    expect(r.commits).toBe(0);
    expect(r.counts.size).toBe(0);
  });

  it('rejects unsafe refs without running git', async () => {
    expect((await snap.churn(dir, '--all', LONG_AGO)).commits).toBe(0);
  });
});
