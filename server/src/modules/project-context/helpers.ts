import { matchesGlob } from 'node:path';
import type { ContextDoc } from '@devdigest/shared';
import type { DocStat } from '../../adapters/project-docs/index.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { classifyDocType } from '../_shared/project-context.js';

/** True when `path` is selected by at least one of the glob `roots`. */
export function matchesAnyRoot(path: string, roots: readonly string[]): boolean {
  return roots.some((root) => matchesGlob(path, root));
}

/** Map a scanned file to its wire row; `usedBy` comes from `countUsedByAgents`. */
export function toContextDoc(
  doc: DocStat,
  tokenizer: Tokenizer,
  usedBy: ReadonlyMap<string, number>,
): ContextDoc {
  return {
    path: doc.path,
    type: classifyDocType(doc.path),
    size_bytes: doc.sizeBytes,
    tokens: tokenizer.count(doc.text),
    updated_at: doc.mtime.toISOString(),
    used_by_agents: usedBy.get(doc.path) ?? 0,
  };
}
