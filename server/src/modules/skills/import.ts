import { unzipSync } from 'fflate';
import type { SkillImportPreview } from '@devdigest/shared';

/**
 * Pure skill-import parser (specs/skills.md §5.3). No filesystem, no spawning:
 * a zip is inflated in memory, only `*.md` entries are ever decompressed, and
 * every other entry is listed in `ignored_files` and never read.
 */

/** Max bytes of the upload itself (also used as the multipart file limit). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
/** Max entries (files + directories) in an archive. */
export const MAX_ZIP_ENTRIES = 200;
/** Max declared uncompressed size of the entries we would inflate (markdown only). */
export const MAX_ZIP_TOTAL_BYTES = 5 * 1024 * 1024;
/** Max declared uncompressed size of a single entry (checked for every entry). */
export const MAX_ZIP_ENTRY_BYTES = 1024 * 1024;
/** Max size of the assembled skill body. */
export const MAX_BODY_BYTES = 1024 * 1024;

export type SkillImportErrorCode =
  | 'unsupported_type'
  | 'too_large'
  | 'too_many_entries'
  | 'entry_too_large'
  | 'archive_too_large'
  | 'path_traversal'
  | 'invalid_archive'
  | 'no_markdown'
  | 'ambiguous_markdown'
  | 'invalid_encoding'
  | 'empty';

export class SkillImportError extends Error {
  constructor(
    public readonly code: SkillImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SkillImportError';
  }
}

export type ParsedSkillUpload = Omit<SkillImportPreview, 'name_taken'>;

const decoder = new TextDecoder('utf-8', { fatal: true });

function decode(bytes: Uint8Array, what: string): string {
  try {
    return decoder.decode(bytes).replace(/^﻿/, '');
  } catch {
    throw new SkillImportError('invalid_encoding', `${what} is not valid UTF-8 text`);
  }
}

function isMarkdown(path: string): boolean {
  return /\.md$/i.test(path);
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Reject traversal / absolute / odd paths. Returns the normalised path. */
export function assertSafeEntryPath(raw: string): string {
  const bad = () => new SkillImportError('path_traversal', `Unsafe path in archive: ${JSON.stringify(raw)}`);
  if (raw.includes('\0') || raw.includes('\\')) throw bad();
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) throw bad();
  const parts = raw.split('/');
  if (parts.some((p) => p === '..')) throw bad();
  return raw;
}

interface Frontmatter {
  name?: string;
  description?: string;
  body: string;
}

/** Minimal `---` frontmatter: only single-line `name:` / `description:` scalars. */
export function parseFrontmatter(text: string): Frontmatter {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { body: text };
  const out: Frontmatter = { body: text };
  for (const line of (m[1] ?? '').split(/\r?\n/)) {
    const kv = /^(name|description):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = (kv[2] ?? '').trim();
    if (/^(".*"|'.*')$/.test(v) && v.length >= 2) v = v.slice(1, -1);
    if (v) out[kv[1] as 'name' | 'description'] = v;
  }
  return out;
}

function stripMarkdownInline(s: string): string {
  return s.replace(/[*_`]/g, '').trim();
}

function firstHeading(md: string): string | undefined {
  let inFence = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (m?.[1]) return stripMarkdownInline(m[1]);
  }
  return undefined;
}

function firstParagraph(md: string): string {
  let inFence = false;
  const para: string[] = [];
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      if (para.length) break;
      continue;
    }
    if (inFence) continue;
    const t = line.trim();
    if (!t) {
      if (para.length) break;
      continue;
    }
    if (/^(#|>|[-*+]\s|\d+\.\s|\||<)/.test(t) && !para.length) continue;
    if (/^#/.test(t)) break;
    para.push(t);
  }
  const text = stripMarkdownInline(para.join(' '));
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

function nameFromFilename(filename: string): string {
  return baseName(filename).replace(/\.(md|zip)$/i, '').trim() || 'imported-skill';
}

function inferType(text: string): ParsedSkillUpload['type'] {
  const head = text.slice(0, 2000).toLowerCase();
  if (/\b(security|vulnerab|owasp)\b/.test(head)) return 'security';
  return 'custom';
}

function derive(
  filename: string,
  md: string,
  fallbackName: string,
): Pick<ParsedSkillUpload, 'name' | 'description' | 'type'> {
  const fm = parseFrontmatter(md);
  const name = fm.name ?? firstHeading(fm.body) ?? fallbackName;
  const description = fm.description ?? firstParagraph(fm.body);
  return { name: name.slice(0, 200), description, type: inferType(md) };
}

function parseMarkdown(filename: string, data: Uint8Array): ParsedSkillUpload {
  const body = decode(data, filename);
  if (!body.trim()) throw new SkillImportError('empty', 'The markdown file is empty');
  return {
    ...derive(filename, body, nameFromFilename(filename)),
    body,
    included_files: [baseName(filename)],
    ignored_files: [],
  };
}

function parseZip(filename: string, data: Uint8Array): ParsedSkillUpload {
  const mdSizes = new Map<string, number>();
  const ignored: string[] = [];
  let entries = 0;
  let total = 0;

  let files: Record<string, Uint8Array>;
  try {
    // `filter` runs on central-directory metadata BEFORE any inflation, so
    // every limit below is enforced without decompressing a byte. Returning
    // false skips the entry entirely (it is never read).
    files = unzipSync(data, {
      filter(f) {
        entries += 1;
        if (entries > MAX_ZIP_ENTRIES) {
          throw new SkillImportError('too_many_entries', `Archive has more than ${MAX_ZIP_ENTRIES} entries`);
        }
        const path = assertSafeEntryPath(f.name);
        if (path.endsWith('/')) return false; // directory
        if (f.originalSize > MAX_ZIP_ENTRY_BYTES) {
          throw new SkillImportError('entry_too_large', `Entry ${path} exceeds ${MAX_ZIP_ENTRY_BYTES} bytes`);
        }
        if (!isMarkdown(path) || path.startsWith('__MACOSX/') || baseName(path).startsWith('._')) {
          ignored.push(path);
          return false;
        }
        total += f.originalSize;
        if (total > MAX_ZIP_TOTAL_BYTES) {
          throw new SkillImportError('archive_too_large', `Archive expands beyond ${MAX_ZIP_TOTAL_BYTES} bytes`);
        }
        mdSizes.set(path, f.originalSize);
        return true;
      },
    });
  } catch (err) {
    if (err instanceof SkillImportError) throw err;
    throw new SkillImportError('invalid_archive', 'Could not read the zip archive');
  }

  const mdPaths = Object.keys(files).sort();
  if (mdPaths.length === 0) throw new SkillImportError('no_markdown', 'The archive contains no markdown files');

  // Main file: SKILL.md at root, else the single top-level *.md, else a SKILL.md
  // inside a single wrapper folder.
  const topLevel = mdPaths.filter((p) => !p.includes('/'));
  const skillMd = (p: string) => baseName(p).toUpperCase() === 'SKILL.MD';
  let main = topLevel.find(skillMd);
  if (!main && topLevel.length === 1) main = topLevel[0];
  if (!main && topLevel.length === 0) {
    const wrapped = mdPaths.filter((p) => p.split('/').length === 2 && skillMd(p));
    if (wrapped.length === 1) main = wrapped[0];
  }
  if (!main) {
    throw new SkillImportError(
      'ambiguous_markdown',
      'Could not pick a main markdown file: add a SKILL.md at the archive root',
    );
  }

  const mainText = decode(files[main]!, main);
  const included = [main];
  let body = mainText;
  for (const p of mdPaths) {
    if (p === main) continue;
    body += `\n\n## ${p}\n\n${decode(files[p]!, p)}`;
    included.push(p);
    if (body.length > MAX_BODY_BYTES) {
      throw new SkillImportError('archive_too_large', `Assembled skill body exceeds ${MAX_BODY_BYTES} bytes`);
    }
  }
  if (!body.trim()) throw new SkillImportError('empty', 'The skill body is empty');

  const fallback = nameFromFilename(filename);
  return { ...derive(filename, mainText, fallback), body, included_files: included, ignored_files: ignored.sort() };
}

/** Parse an uploaded `.md` or `.zip` into a preview (without `name_taken`). */
export function parseSkillUpload(filename: string, data: Uint8Array): ParsedSkillUpload {
  if (data.byteLength > MAX_UPLOAD_BYTES) {
    throw new SkillImportError('too_large', `Upload exceeds ${MAX_UPLOAD_BYTES} bytes`);
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith('.md')) return parseMarkdown(filename, data);
  if (lower.endsWith('.zip')) return parseZip(filename, data);
  throw new SkillImportError('unsupported_type', 'Only .md and .zip files can be imported');
}
