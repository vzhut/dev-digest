import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import {
  MAX_UPLOAD_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_ENTRY_BYTES,
  SkillImportError,
  parseSkillUpload,
} from '../src/modules/skills/import.js';

const md = (s: string) => strToU8(s);
const zip = (files: Record<string, string | Uint8Array>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(SkillImportError);
    return (e as SkillImportError).code;
  }
  return 'no-throw';
};

describe('parseSkillUpload .md', () => {
  it('derives name from first heading and description from first paragraph', () => {
    const r = parseSkillUpload('x.md', md('# My Rubric\n\nChecks *things* carefully.\nSecond line.\n\nOther.'));
    expect(r.name).toBe('My Rubric');
    expect(r.description).toBe('Checks things carefully. Second line.');
    expect(r.type).toBe('custom');
    expect(r.included_files).toEqual(['x.md']);
    expect(r.ignored_files).toEqual([]);
  });
  it('falls back to filename when no heading', () => {
    expect(parseSkillUpload('style-guide.md', md('just text')).name).toBe('style-guide');
  });
  it('frontmatter description wins', () => {
    const r = parseSkillUpload('a.md', md('---\nname: fm-name\ndescription: "From FM"\n---\n# Heading\n\nPara'));
    expect(r.name).toBe('fm-name');
    expect(r.description).toBe('From FM');
  });
  it('rejects unsupported extensions and empty files', () => {
    expect(code(() => parseSkillUpload('a.sh', md('x')))).toBe('unsupported_type');
    expect(code(() => parseSkillUpload('a.md', md('  ')))).toBe('empty');
  });
  it('rejects oversized upload', () => {
    expect(code(() => parseSkillUpload('a.md', new Uint8Array(MAX_UPLOAD_BYTES + 1)))).toBe('too_large');
  });
});

describe('parseSkillUpload .zip', () => {
  it('uses SKILL.md, appends other md, ignores everything else', () => {
    const r = parseSkillUpload(
      'pack.zip',
      zip({
        'SKILL.md': '---\ndescription: Zip desc\n---\n# Zip Skill\n\nBody',
        'docs/extra.md': 'extra',
        'install.sh': 'rm -rf /',
        'lib/a.py': 'print(1)',
        'bin.dat': new Uint8Array([0, 1, 2, 255]),
        'nested.zip': zip({ 'a.md': 'x' }),
      }),
    );
    expect(r.name).toBe('Zip Skill');
    expect(r.description).toBe('Zip desc');
    expect(r.included_files).toEqual(['SKILL.md', 'docs/extra.md']);
    expect(r.ignored_files).toEqual(['bin.dat', 'install.sh', 'lib/a.py', 'nested.zip']);
    expect(r.body).toContain('## docs/extra.md\n\nextra');
    expect(r.body).not.toContain('rm -rf');
  });
  it('takes the single top-level md when there is no SKILL.md', () => {
    const r = parseSkillUpload('p.zip', zip({ 'guide.md': '# G\n\nd' }));
    expect(r.included_files).toEqual(['guide.md']);
  });
  it('supports a single wrapper folder with SKILL.md', () => {
    expect(parseSkillUpload('p.zip', zip({ 'pkg/SKILL.md': '# W\n\nd' })).included_files).toEqual(['pkg/SKILL.md']);
  });
  it('lists non-markdown entries as ignored without reading them', () => {
    const z = zipSync({ 'SKILL.md': md('# A\n\nb'), 'x.sh': [md('echo hi'), { level: 0 }] });
    expect(parseSkillUpload('p.zip', z).ignored_files).toEqual(['x.sh']);
  });
  it('is ambiguous with several top-level md and no SKILL.md', () => {
    expect(code(() => parseSkillUpload('p.zip', zip({ 'a.md': 'a', 'b.md': 'b' })))).toBe('ambiguous_markdown');
  });
  it('rejects archives with no markdown and garbage', () => {
    expect(code(() => parseSkillUpload('p.zip', zip({ 'a.sh': 'x' })))).toBe('no_markdown');
    expect(code(() => parseSkillUpload('p.zip', md('not a zip')))).toBe('invalid_archive');
  });
  it('rejects path traversal and absolute paths, even for ignored entries', () => {
    expect(code(() => parseSkillUpload('p.zip', zip({ 'SKILL.md': 'a', '../evil.sh': 'x' })))).toBe('path_traversal');
    expect(code(() => parseSkillUpload('p.zip', zip({ '/etc/passwd.md': 'x' })))).toBe('path_traversal');
    expect(code(() => parseSkillUpload('p.zip', zip({ 'a/../../b.md': 'x' })))).toBe('path_traversal');
  });
  it('rejects too many entries', () => {
    const files: Record<string, string> = { 'SKILL.md': 'a' };
    for (let i = 0; i < MAX_ZIP_ENTRIES; i++) files[`f${i}.txt`] = 'x';
    expect(code(() => parseSkillUpload('p.zip', zip(files)))).toBe('too_many_entries');
  });
  it('rejects a bomb (large highly-compressible entry) before inflating', () => {
    const big = new Uint8Array(MAX_ZIP_ENTRY_BYTES + 1).fill(97);
    const z = zip({ 'SKILL.md': big });
    expect(z.byteLength).toBeLessThan(MAX_UPLOAD_BYTES);
    expect(code(() => parseSkillUpload('p.zip', z))).toBe('entry_too_large');
    expect(code(() => parseSkillUpload('p.zip', zip({ 'SKILL.md': 'a', 'big.bin': big })))).toBe('entry_too_large');
  });
  it('rejects when total uncompressed markdown exceeds the cap', () => {
    const chunk = new Uint8Array(MAX_ZIP_ENTRY_BYTES - 10).fill(97);
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 6; i++) files[`f${i}.md`] = chunk;
    expect(code(() => parseSkillUpload('p.zip', zip(files)))).toBe('archive_too_large');
  });
});
