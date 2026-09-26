/**
 * Pure helpers for the intent module (side-effect free: no DB / network / FS).
 *
 * Security-relevant parsing lives here: everything in `extractReferences` runs
 * on attacker-controlled PR text, so it is length-capped and uses only bounded,
 * non-nested regex quantifiers (ReDoS-safe), and `isSafeRepoPath` is the gate
 * in front of every repo-file read.
 */
import { createHash } from 'node:crypto';
import type { IntentConfidence, IntentSource, PrIntentRecord } from '@devdigest/shared';
import type { PrIntentRow } from '../../db/rows.js';
import {
  MAX_BLOCKED_REFS,
  MAX_FILE_REFS,
  MAX_HUNK_HEADERS,
  MAX_HUNK_HEADER_CHARS,
  MAX_ISSUE_REFS,
  MAX_LOG_ERROR_CHARS,
  MAX_REPO_PATH_CHARS,
  MAX_SCAN_CHARS,
  MAX_TICKET_REFS,
  MAX_URL_CHARS,
  REPO_FILE_EXTENSIONS,
} from './constants.js';

// ---- reference extraction --------------------------------------------------

export interface RepoCoordinates {
  owner: string;
  name: string;
}

export interface IssueRef extends RepoCoordinates {
  number: number;
  /** Display ref: `#12` (same repo) or `owner/repo#12`. */
  ref: string;
}

export interface FileRef {
  path: string;
  ref: string;
}

export interface TicketRef {
  host: string;
  key: string;
  /** `host/KEY` — never the raw URL (no query string, no userinfo). */
  ref: string;
}

export interface BlockedRef {
  kind: 'github_issue' | 'repo_file' | 'external_ticket';
  ref: string;
  reason: string;
}

export interface ExtractedRefs {
  issues: IssueRef[];
  files: FileRef[];
  tickets: TicketRef[];
  /** References we will never fetch (arbitrary URLs, unsafe paths, over the cap). */
  blocked: BlockedRef[];
}

const ARBITRARY_URL = 'arbitrary URL not fetched';

// All quantifiers below are bounded and the input is capped at MAX_SCAN_CHARS.
const URL_RE = /https?:\/\/[^\s<>()[\]"'`]{1,300}/gi;
const CROSS_REPO_ISSUE_RE = /(?<![\w./@-])([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})#(\d{1,7})(?!\w)/g;
const SAME_REPO_ISSUE_RE = /(?<![\w&/#])#(\d{1,7})(?!\w)/g;
const FILE_PATH_RE = /(?<![\w./@:#-])((?:[\w.-]{1,100}\/){0,8}[\w.-]{1,100}\.(?:md|txt))(?![\w/-])/gi;
const JIRA_KEY_PATH_RE = /^\/browse\/([A-Za-z][A-Za-z0-9]{1,9}-\d{1,7})\/?$/;
const LINEAR_KEY_PATH_RE = /^\/[^/]{1,100}\/issue\/([A-Za-z][A-Za-z0-9]{0,9}-\d{1,7})(?:\/|$)/;

function sameRepo(a: RepoCoordinates, b: RepoCoordinates): boolean {
  return a.owner.toLowerCase() === b.owner.toLowerCase() && a.name.toLowerCase() === b.name.toLowerCase();
}

function trimUrlTail(u: string): string {
  return u.replace(/[.,;:!?]+$/, '');
}

/**
 * Repo-relative paths only, plain-text docs only. Rejects absolute paths, `..`
 * and `.git` segments, backslashes, NUL, empty segments, leading `-`, non
 * `.md`/`.txt` files and anything over 200 chars. This is the gate in front of
 * every repo-file read (`GitClient.readFile` has no traversal guard).
 */
export function isSafeRepoPath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0 || p.length > MAX_REPO_PATH_CHARS) return false;
  if (p.includes('\0') || p.includes('\\')) return false;
  if (p.startsWith('/') || p.startsWith('-') || /^[A-Za-z]:/.test(p)) return false;
  const lower = p.toLowerCase();
  if (!REPO_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return false;
  const segments = p.split('/');
  for (const seg of segments) {
    if (seg === '' || seg === '.' || seg === '..' || seg.toLowerCase() === '.git') return false;
  }
  return true;
}

/**
 * Find what a PR points at: GitHub issues (`#N`, `owner/repo#N`, issue URL),
 * in-repo spec/plan files (paths, same-repo blob URLs) and Jira/Linear tickets.
 * Every other URL is `blocked`. Dedupes, applies per-kind caps, and never
 * returns a raw URL as a ref (host only for arbitrary URLs).
 */
export function extractReferences(text: string | null | undefined, repo: RepoCoordinates): ExtractedRefs {
  const out: ExtractedRefs = { issues: [], files: [], tickets: [], blocked: [] };
  const scan = (text ?? '').slice(0, MAX_SCAN_CHARS);
  if (scan.length === 0) return out;

  const seen = new Set<string>();
  const blocked = (kind: BlockedRef['kind'], ref: string, reason: string) => {
    const key = `b:${kind}:${ref}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.blocked.push({ kind, ref, reason });
  };
  const addIssue = (o: string, n: string, num: number) => {
    const same = sameRepo({ owner: o, name: n }, repo);
    const ref = same ? `#${num}` : `${o}/${n}#${num}`;
    const key = `i:${o.toLowerCase()}/${n.toLowerCase()}#${num}`;
    if (seen.has(key)) return;
    seen.add(key);
    // Another repository is never read: the fetch uses the operator's token, which may see
    // repos the PR author cannot, so a PR could pull a private issue into the intent.
    if (!same) return blocked('github_issue', ref, 'issue in another repository');
    if (out.issues.length >= MAX_ISSUE_REFS) return blocked('github_issue', ref, 'reference limit reached');
    out.issues.push({ owner: o, name: n, number: num, ref });
  };
  const addFile = (path: string) => {
    const key = `f:${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!isSafeRepoPath(path)) return blocked('repo_file', path.slice(0, 80), 'unsafe path');
    if (out.files.length >= MAX_FILE_REFS) return blocked('repo_file', path, 'reference limit reached');
    out.files.push({ path, ref: path });
  };
  const addTicket = (host: string, rawKey: string) => {
    const key = rawKey.toUpperCase();
    const ref = `${host}/${key}`;
    const dedupe = `t:${ref}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    if (out.tickets.length >= MAX_TICKET_REFS) return blocked('external_ticket', ref, 'reference limit reached');
    out.tickets.push({ host, key, ref });
  };

  // 1. URLs — parsed with URL(), never fetched from here.
  for (const m of scan.matchAll(URL_RE)) {
    const raw = trimUrlTail(m[0]).slice(0, MAX_URL_CHARS);
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    const host = url.hostname.toLowerCase();
    const segs = url.pathname.split('/').filter(Boolean);
    if (host === 'github.com' || host === 'www.github.com') {
      const [o, r, kind, a, ...rest] = segs;
      if (o && r && kind === 'issues' && a && /^\d{1,7}$/.test(a) && rest.length === 0) {
        addIssue(o, r, Number(a));
        continue;
      }
      if (o && r && kind === 'blob' && a && rest.length > 0) {
        if (sameRepo({ owner: o, name: r }, repo)) {
          let path = rest.join('/');
          try {
            path = decodeURIComponent(path);
          } catch {
            /* keep the raw path; isSafeRepoPath decides */
          }
          addFile(path);
        } else {
          blocked('repo_file', `${o}/${r}`, 'file in another repository');
        }
        continue;
      }
      blocked('external_ticket', host, ARBITRARY_URL);
      continue;
    }
    const jira = JIRA_KEY_PATH_RE.exec(url.pathname);
    if (jira) {
      addTicket(host, jira[1]!);
      continue;
    }
    if (host === 'linear.app' || host.endsWith('.linear.app')) {
      const lin = LINEAR_KEY_PATH_RE.exec(url.pathname);
      if (lin) {
        addTicket(host, lin[1]!);
        continue;
      }
    }
    blocked('external_ticket', host, ARBITRARY_URL);
  }

  // 2. Plain-text refs on what is left once URLs are removed.
  let rest = scan.replace(URL_RE, ' ');
  rest = rest.replace(CROSS_REPO_ISSUE_RE, (_all, o: string, n: string, num: string) => {
    addIssue(o, n, Number(num));
    return ' ';
  });
  for (const m of rest.matchAll(SAME_REPO_ISSUE_RE)) addIssue(repo.owner, repo.name, Number(m[1]));
  for (const m of rest.matchAll(FILE_PATH_RE)) addFile(m[1]!);

  out.blocked = out.blocked.slice(0, MAX_BLOCKED_REFS);
  return out;
}

// ---- diff / text helpers ---------------------------------------------------

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;

/**
 * `@@ -a,b +c,d @@ <context>` lines only — the classifier never sees diff
 * bodies. Each header is capped; at most MAX_HUNK_HEADERS are returned.
 */
export function extractHunkHeaders(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('@@')) continue;
    const l = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (!HUNK_HEADER_RE.test(l)) continue;
    out.push(l.slice(0, MAX_HUNK_HEADER_CHARS));
    if (out.length >= MAX_HUNK_HEADERS) break;
  }
  return out;
}

/**
 * Remove `<!-- … -->` comments (PR templates hide instructions there). Linear
 * (indexOf, no backtracking regex); an unterminated `<!--` drops the rest, as
 * GitHub renders it.
 */
export function stripHtmlComments(s: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const open = s.indexOf('<!--', i);
    if (open === -1) return out + s.slice(i);
    out += s.slice(i, open);
    const close = s.indexOf('-->', open + 4);
    if (close === -1) return out;
    i = close + 3;
  }
}

export function capText(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

// ---- staleness -------------------------------------------------------------

/** Hash of everything the derivation reads from the PR itself (not the linked sources). */
export function inputHash(i: {
  title: string;
  body: string | null | undefined;
  files: { path: string; additions: number; deletions: number }[];
  headSha: string;
}): string {
  const files = [...i.files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => [f.path, f.additions, f.deletions]);
  return createHash('sha256')
    .update(JSON.stringify([i.title, i.body ?? '', i.headSha, files]))
    .digest('hex');
}

/** Stale when the PR head moved or the inputs changed since the intent was derived. */
export function isStale(
  row: { headSha: string | null; inputHash: string | null },
  pull: { headSha: string },
  hash: string,
): boolean {
  return row.headSha !== pull.headSha || row.inputHash !== hash;
}

// ---- logging / errors ------------------------------------------------------

/**
 * Mask credentials before an error text reaches a log or an API response: git
 * errors can print the clone URL with the token embedded (server/INSIGHTS.md),
 * provider errors can echo an Authorization header. Also drops URL query
 * strings and userinfo. Output is length-capped.
 */
export function redactSecrets(msg: string): string {
  return msg
    .replace(/x-access-token:[^@\s/]+@/gi, 'x-access-token:***@')
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1***@')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***')
    .replace(/\bBasic\s+[A-Za-z0-9+/]{12,}={0,2}/g, 'Basic ***') // Jira: base64(email:token)
    .replace(/\blin_api_[A-Za-z0-9]{10,}/g, 'lin_api_***') // Linear personal API key
    .replace(/\bgithub_pat_[A-Za-z0-9_]{10,}/g, 'github_pat_***')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{10,}/g, 'gh*_***')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}/g, 'sk-***')
    .replace(/(https?:\/\/[^\s?#"'`]+)\?[^\s"'`]*/gi, '$1?…')
    .slice(0, MAX_LOG_ERROR_CHARS);
}

/** Short, safe reason for a failed source read (never the raw error text). */
export function unavailableReason(err: unknown): string {
  const e = err as { status?: number; code?: string; name?: string } | null;
  if (e?.code === 'config_error') return 'not configured';
  if (e?.name === 'TimeoutError' || e?.code === 'ETIMEDOUT') return 'timed out';
  if (e?.status === 404) return 'not found';
  if (e?.status === 403) return 'forbidden';
  if (e?.status === 401) return 'unauthorized';
  return 'unavailable';
}

// ---- source bookkeeping ----------------------------------------------------

const CORE_KINDS = new Set<IntentSource['kind']>(['pr_title', 'pr_description', 'file_list', 'hunk_headers']);
const LOADED = new Set<IntentSource['status']>(['used', 'truncated']);

/** One short token per source for the Live Log: refs and counts only, never content. */
export function describeSource(s: IntentSource): string {
  const reason = s.reason ? ` (${s.reason})` : '';
  if (CORE_KINDS.has(s.kind)) {
    if (!LOADED.has(s.status)) return `${s.ref} ${s.status}${reason}`;
    return s.kind === 'pr_description' ? `${s.ref} ${s.chars}ch` : s.ref;
  }
  if (s.status === 'used') return `${s.ref} ok`;
  if (s.status === 'truncated') return `${s.ref} truncated`;
  return `${s.ref} ${s.status}${reason}`;
}

export function summarizeSources(sources: readonly IntentSource[]): string {
  return sources.map(describeSource).join(', ');
}

/** What the model was NOT given, in words the user can act on. */
export function buildMissingContext(sources: readonly IntentSource[]): string[] {
  return sources
    .filter((s) => !LOADED.has(s.status))
    .map((s) => {
      if (CORE_KINDS.has(s.kind)) return s.reason ? `${s.ref}: ${s.reason}` : `${s.ref} unavailable`;
      return s.reason ? `${s.ref} (${s.reason})` : s.ref;
    });
}

// ---- DTO -------------------------------------------------------------------

export function toPrIntentDto(row: PrIntentRow, stale: boolean): PrIntentRecord {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    risk_areas: row.riskAreas,
    head_sha: row.headSha,
    stale,
    confidence: row.confidence as IntentConfidence,
    sources: row.sources,
    missing_context: row.missingContext,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
