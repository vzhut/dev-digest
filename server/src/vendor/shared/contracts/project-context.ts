import { z } from 'zod';

/**
 * Project context — repo documents (specs / docs / insights) an agent or skill
 * attaches to a review. Wire fields are snake_case. Paths are repo-relative and
 * posix-style; they are validated here because they later reach the filesystem
 * and a prompt label.
 */

export const ContextDocType = z.enum(['specs', 'docs', 'insights', 'other']);
export type ContextDocType = z.infer<typeof ContextDocType>;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** A repo-relative markdown path: no traversal, no backslash/quote/control chars. */
export const ContextPath = z
  .string()
  .min(1)
  .max(512)
  .refine((p) => p.endsWith('.md'), { message: 'path must end with .md' })
  .refine((p) => !p.includes('\\') && !p.includes('"') && !CONTROL_CHARS.test(p), {
    message: 'path contains a forbidden character',
  })
  .refine((p) => p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..'), {
    message: 'path must be relative with no empty, "." or ".." segment',
  });
export type ContextPath = z.infer<typeof ContextPath>;

export const ContextPathList = z
  .array(ContextPath)
  .max(200)
  .refine((paths) => new Set(paths).size === paths.length, { message: 'duplicate paths' });
export type ContextPathList = z.infer<typeof ContextPathList>;

/** A glob selecting which markdown files are listed (e.g. `**\/docs/**\/*.md`). */
export const SearchRoot = z
  .string()
  .min(1)
  .max(200)
  .refine((r) => !r.startsWith('/'), { message: 'root must be relative' })
  .refine((r) => !r.split('/').includes('..'), { message: 'root must not contain ".."' });
export type SearchRoot = z.infer<typeof SearchRoot>;

export const SearchRoots = z.array(SearchRoot).max(20);
export type SearchRoots = z.infer<typeof SearchRoots>;

export const ContextDoc = z.object({
  path: z.string(),
  type: ContextDocType,
  size_bytes: z.number().int(),
  tokens: z.number().int(),
  updated_at: z.string(),
  used_by_agents: z.number().int(),
});
export type ContextDoc = z.infer<typeof ContextDoc>;

export const ContextListing = z.object({
  roots: z.array(z.string()),
  status: z.enum(['ok', 'not_cloned']),
  scanned_at: z.string(),
  total_tokens: z.number().int(),
  files: z.array(ContextDoc),
});
export type ContextListing = z.infer<typeof ContextListing>;

export const ContextDocContent = z.object({
  path: z.string(),
  content: z.string(),
});
export type ContextDocContent = z.infer<typeof ContextDocContent>;

export const AgentContext = z.object({
  paths: z.array(z.string()),
  inherited: z.array(
    z.object({
      skill_id: z.string(),
      skill_name: z.string(),
      paths: z.array(z.string()),
    }),
  ),
});
export type AgentContext = z.infer<typeof AgentContext>;

export const SkillContext = z.object({
  paths: z.array(z.string()),
});
export type SkillContext = z.infer<typeof SkillContext>;

export const SetContextPathsBody = z.object({ paths: ContextPathList });
export type SetContextPathsBody = z.infer<typeof SetContextPathsBody>;

export const SetSearchRootsBody = z.object({ roots: SearchRoots });
export type SetSearchRootsBody = z.infer<typeof SetSearchRootsBody>;

/** Largest document a write accepts (UTF-8 bytes). */
export const MAX_CONTEXT_DOC_BYTES = 1_048_576;

export const WriteContextFileBody = z.object({
  path: ContextPath,
  content: z
    .string()
    .refine((c) => new TextEncoder().encode(c).byteLength <= MAX_CONTEXT_DOC_BYTES, {
      message: 'content exceeds 1 MiB',
    }),
});
export type WriteContextFileBody = z.infer<typeof WriteContextFileBody>;

export const ContextDocWritten = z.object({
  path: z.string(),
  content: z.string(),
  size_bytes: z.number().int(),
  tokens: z.number().int(),
});
export type ContextDocWritten = z.infer<typeof ContextDocWritten>;
