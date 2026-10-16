import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadManifest, findManifestPath } from './manifest.js';
import { RunnerError } from './errors.js';

/** Parity of the manifest the runner reads with the optional export-time fields (version, skill_versions, post_as). */

const BASE = `
name: "Security Reviewer"
model: "deepseek/deepseek-v4-flash"
system_prompt: "Review this PR."
skills: ["sec", "perf"]
ci_fail_on: "warning"
`;

describe('manifest optional export fields', () => {
  let dir: string;
  const write = (extra: string, file = 'agent.yaml') =>
    writeFileSync(path.join(dir, 'agents', file), BASE + extra);

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-manifest-fields-'));
    mkdirSync(path.join(dir, 'agents'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('accepts version, skill_versions and post_as and returns them as written', () => {
    write('version: 3\nskill_versions:\n  sec: 2\n  perf: 0\npost_as: pr_comment\n');

    const m = loadManifest(dir);

    expect(m.version).toBe(3);
    expect(m.skill_versions).toEqual({ sec: 2, perf: 0 });
    expect(m.post_as).toBe('pr_comment');
  });

  it('still validates a legacy manifest without the new fields (they stay unset)', () => {
    write('');

    const m = loadManifest(dir);

    expect(m.version ?? null).toBeNull();
    expect(m.skill_versions ?? null).toBeNull();
    expect(m.post_as ?? null).toBeNull();
  });

  it('accepts explicit nulls for the new fields', () => {
    write('version: null\nskill_versions: null\npost_as: null\n');
    expect(() => loadManifest(dir)).not.toThrow();
  });

  it.each([
    ['negative version', 'version: -1\n', /version/],
    ['fractional version', 'version: 1.5\n', /version/],
    ['string version', 'version: "two"\n', /version/],
    ['negative skill version', 'skill_versions:\n  sec: -2\n', /skill_versions/],
    ['non-numeric skill version', 'skill_versions:\n  sec: latest\n', /skill_versions/],
    ['skill_versions as a list', 'skill_versions: [1, 2]\n', /skill_versions/],
    ['unknown post_as', 'post_as: email\n', /post_as/],
  ])('rejects %s with a RunnerError naming the field', (_label, extra, field) => {
    write(extra);

    expect(() => loadManifest(dir)).toThrow(RunnerError);
    expect(() => loadManifest(dir)).toThrow(field);
  });
});

describe('exactly one manifest is required', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-manifest-count-'));
    mkdirSync(path.join(dir, 'agents'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('counts .yaml and .yml together, and ignores non-YAML files', () => {
    writeFileSync(path.join(dir, 'agents', 'README.md'), '# not a manifest');
    writeFileSync(path.join(dir, 'agents', 'one.yml'), BASE);
    expect(findManifestPath(dir)).toBe(path.join(dir, 'agents', 'one.yml'));

    writeFileSync(path.join(dir, 'agents', 'two.yaml'), BASE);
    expect(() => findManifestPath(dir)).toThrow(/exactly one/i);
  });

  it('fails when the agents directory holds no YAML file', () => {
    writeFileSync(path.join(dir, 'agents', 'notes.txt'), 'x');
    expect(() => findManifestPath(dir)).toThrow(/No agent manifest/);
  });
});
