import type { BlastDegradedReason, BlastRadius, BlastStats } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

/**
 * GitHub blob link for a caller's `file:line`, or `null` while the repo hasn't
 * loaded yet (`repoFullName` is `null` until then — PrDetailView.tsx). The
 * caller renders plain `file:line` text instead of a link in that case.
 */
export function callerHref(
  repoFullName: string | null,
  ref: string,
  file: string,
  line: number,
): string | null {
  if (!repoFullName) return null;
  return githubBlobUrl(repoFullName, ref, file, line);
}

/**
 * The git ref caller links point at: the SHA the index was built from, or the
 * PR's base branch when the map has no `indexed_sha` (the ripgrep fallback
 * reads the clone's checked-out default branch, not a pinned commit).
 */
export function refFor(blast: Pick<BlastRadius, "indexed_sha">, baseRef: string): string {
  return blast.indexed_sha ?? baseRef;
}

/**
 * Numbers for the summary row. The server sends `stats`; older or partially
 * degraded payloads may omit it, so fall back to deriving the same numbers
 * from the map itself.
 */
export function statsOf(blast: BlastRadius): BlastStats {
  if (blast.stats) return blast.stats;
  const callers = blast.downstream.reduce((n, d) => n + (d.callers_total ?? d.callers.length), 0);
  const endpoints = new Set(blast.downstream.flatMap((d) => d.endpoints_affected)).size;
  const crons = new Set(blast.downstream.flatMap((d) => d.crons_affected)).size;
  return {
    symbols_changed: blast.changed_symbols.length,
    symbols_affected: blast.downstream.length,
    callers,
    endpoints,
    crons,
  };
}

/** Whether to show the incomplete-index marker, and which reason to translate. */
export function incompleteNotice(
  blast: Pick<BlastRadius, "degraded" | "reason">,
): { show: boolean; reasonKey: BlastDegradedReason | null } {
  return { show: blast.degraded === true, reasonKey: blast.reason ?? null };
}
