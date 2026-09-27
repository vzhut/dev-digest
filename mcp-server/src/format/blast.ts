// Pure blast-radius helpers: caps `downstream` to `limit`, caps `callers` per symbol to
// BLAST_CALLERS_SHOWN, sanitises names/paths, and turns a degraded/partial repo index into an
// explicit `status:"incomplete"` + resync hint — never a bare empty map (trap 9).
import { BLAST_CALLERS_SHOWN, type BlastRadiusResult } from '../contracts.js';
import { limitWithHint } from './respond.js';
import { sanitizeText } from './sanitize.js';

export interface BlastCallerInput {
  name: string;
  file: string;
  line: number;
}

export interface BlastDownstreamInput {
  symbol: string;
  file?: string | null | undefined;
  callers: readonly BlastCallerInput[];
  callers_total?: number | null | undefined;
  endpoints_affected?: readonly string[] | null | undefined;
  crons_affected?: readonly string[] | null | undefined;
}

export interface BlastChangedSymbolInput {
  name: string;
  file: string;
  kind: string;
}

export interface BlastDataInput {
  changed_symbols: readonly BlastChangedSymbolInput[];
  downstream: readonly BlastDownstreamInput[];
  summary: string;
  degraded?: boolean | null | undefined;
  reason?: string | null | undefined;
  index_status?: string | null | undefined;
  unattributed_endpoints?: readonly string[] | null | undefined;
}

export interface BuildBlastInput {
  repo: string;
  pr: number;
  data: BlastDataInput;
  limit: number;
}

const NAME_MAX = 160;
const FILE_MAX = 200;
const SUMMARY_MAX = 600;

function truncationHint(shown: number, total: number): string {
  return `showing ${shown} of ${total} — raise limit (max 50)`;
}

/** "repo index is <status> (<reason>) — callers may be missing; resync the repo in DevDigest, then retry" */
function resyncHint(indexStatus: string | null | undefined, reason: string | null | undefined): string {
  return `repo index is ${indexStatus ?? 'unknown'} (${reason ?? 'unknown'}) — callers may be missing; resync the repo in DevDigest, then retry`;
}

/** Maps the server's `/pulls/:id/blast` response (schemas.ts) to the tool's compact output. */
export function buildBlastResult(input: BuildBlastInput): BlastRadiusResult {
  const { repo, pr, data, limit } = input;
  const degraded = data.degraded === true;

  const page = limitWithHint(data.downstream, limit, truncationHint);
  const downstream = page.items.map((d) => {
    const callers = d.callers.slice(0, BLAST_CALLERS_SHOWN).map((c) => ({
      name: sanitizeText(c.name, NAME_MAX),
      where: `${sanitizeText(c.file, FILE_MAX)}:${c.line}`,
    }));
    const item: BlastRadiusResult['downstream'][number] = {
      symbol: sanitizeText(d.symbol, NAME_MAX),
      callers_total: d.callers_total ?? d.callers.length,
      callers,
    };
    if (d.file) item.file = sanitizeText(d.file, FILE_MAX);
    if (d.endpoints_affected && d.endpoints_affected.length > 0) {
      item.endpoints_affected = d.endpoints_affected.map((e) => sanitizeText(e, FILE_MAX));
    }
    if (d.crons_affected && d.crons_affected.length > 0) {
      item.crons_affected = d.crons_affected.map((c) => sanitizeText(c, FILE_MAX));
    }
    return item;
  });

  // `changed_symbols` mirrors the shown `downstream` page — a symbol truncated out of the
  // page has no point being listed without its callers.
  const shownSymbols = new Set(page.items.map((d) => d.symbol));
  const result: BlastRadiusResult = {
    status: degraded ? 'incomplete' : 'ok',
    repo,
    pr,
    summary: sanitizeText(data.summary, SUMMARY_MAX, { multiline: true }),
    changed_symbols: data.changed_symbols
      .filter((s) => shownSymbols.has(s.name))
      .map((s) => ({
        name: sanitizeText(s.name, NAME_MAX),
        file: sanitizeText(s.file, FILE_MAX),
        kind: s.kind,
      })),
    downstream,
    shown: page.shown,
    total: page.total,
  };
  if (data.index_status) result.index_status = data.index_status;
  if (data.unattributed_endpoints && data.unattributed_endpoints.length > 0) {
    result.unattributed_endpoints = data.unattributed_endpoints.map((e) => sanitizeText(e, FILE_MAX));
  }

  const hints: string[] = [];
  if (degraded) {
    result.reason = data.reason ?? 'unknown';
    hints.push(resyncHint(data.index_status, data.reason));
  }
  if (page.hint) hints.push(page.hint);
  if (hints.length > 0) result.hint = hints.join('; ');
  return result;
}
