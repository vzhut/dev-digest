import type { IntentSource } from '@devdigest/shared';
import { MIN_DESCRIPTION_CHARS, SUBSTANTIVE_DESCRIPTION_CHARS } from './constants.js';

const LINKED_KINDS = new Set<IntentSource['kind']>(['github_issue', 'repo_file', 'external_ticket']);
const LOADED = new Set<IntentSource['status']>(['used', 'truncated']);

/**
 * Deterministic confidence in a derived intent. Computed from the sources, NOT
 * asked of the model — cheap models self-report 0.9–1.0 regardless of quality.
 *
 * - low:    description too short, OR a linked source was referenced but none loaded,
 *           OR no linked source loaded and the description is thin (< SUBSTANTIVE_DESCRIPTION_CHARS)
 * - high:   description long enough, ≥1 linked source loaded, nothing missing/blocked
 * - medium: everything else
 */
export function computeIntentConfidence(
  sources: readonly IntentSource[],
  descriptionChars: number,
): 'high' | 'medium' | 'low' {
  const linked = sources.filter((s) => LINKED_KINDS.has(s.kind));
  const linkedLoaded = linked.some((s) => LOADED.has(s.status));
  const linkedFailed = linked.some((s) => !LOADED.has(s.status));
  if (descriptionChars < MIN_DESCRIPTION_CHARS) return 'low';
  if (linkedFailed && !linkedLoaded) return 'low';
  if (!linkedLoaded && descriptionChars < SUBSTANTIVE_DESCRIPTION_CHARS) return 'low';
  const anyFailed = sources.some((s) => !LOADED.has(s.status));
  if (linkedLoaded && !anyFailed) return 'high';
  return 'medium';
}

/** Meaningful description length: trimmed, whitespace collapsed. */
export function meaningfulChars(description: string): number {
  return description.replace(/\s+/g, ' ').trim().length;
}
