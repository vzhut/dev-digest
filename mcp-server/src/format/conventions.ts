// Pure conventions helpers: status filter, ordering, concise/detailed mapping and the
// distinct "never extracted" / "none accepted" states. Extraction is never triggered here.
import type { ConventionItem, ConventionStatusFilter, ConventionsResult, ResponseFormat } from '../contracts.js';
import { UNTRUSTED_NOTE } from '../contracts.js';
import { limitWithHint } from './respond.js';
import { sanitizeText } from './sanitize.js';

export interface CandidateInput {
  id: string;
  category: string;
  rule: string;
  evidence_path: string;
  evidence_line_start: number;
  evidence_line_end: number;
  evidence_snippet: string;
  evidence_url: string;
  status: string;
  // `confidence` deliberately unused.
}

export interface ScanInput {
  sha: string;
}

const RULE_MAX = 300;
const SNIPPET_MAX = 400;
const PATH_MAX = 200;
const STATUS_ORDER: Record<string, number> = { accepted: 0, pending: 1, rejected: 2 };

function evidenceOf(c: CandidateInput): string {
  return `${sanitizeText(c.evidence_path, PATH_MAX)}:${c.evidence_line_start}-${c.evidence_line_end}`;
}

function compareCandidates(a: CandidateInput, b: CandidateInput): number {
  return (
    (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
    a.category.localeCompare(b.category) ||
    a.evidence_path.localeCompare(b.evidence_path) ||
    a.evidence_line_start - b.evidence_line_start
  );
}

export function toConventionItem(c: CandidateInput, format: ResponseFormat, withStatus: boolean): ConventionItem {
  const item: ConventionItem = {
    category: c.category,
    rule: sanitizeText(c.rule, RULE_MAX),
    evidence: evidenceOf(c),
  };
  if (withStatus || format === 'detailed') item.status = c.status;
  if (format === 'detailed') {
    item.snippet = sanitizeText(c.evidence_snippet, SNIPPET_MAX, { multiline: true });
    item.url = c.evidence_url;
  }
  return item;
}

export interface BuildConventionsInput {
  repo: string;
  scan: ScanInput | null | undefined;
  candidates: readonly CandidateInput[];
  status: ConventionStatusFilter;
  limit: number;
  format: ResponseFormat;
}

export function buildConventionsResult(input: BuildConventionsInput): ConventionsResult {
  const { repo, scan, candidates } = input;
  if (!scan) {
    return {
      status: 'not_extracted',
      repo,
      hint: `no conventions scan for ${repo} yet — run Extract on the repo's Conventions page in DevDigest`,
    };
  }

  const pending = candidates.filter((c) => c.status === 'pending').length;
  const accepted = candidates.filter((c) => c.status === 'accepted').length;
  if (input.status === 'accepted' && accepted === 0) {
    return {
      status: 'none_accepted',
      repo,
      scan_sha: scan.sha,
      pending,
      hint:
        pending > 0
          ? `${pending} candidates await review — pass status=pending or accept them in DevDigest`
          : 'no conventions accepted yet — accept candidates on the repo\'s Conventions page in DevDigest',
    };
  }

  const wanted = candidates.filter((c) => input.status === 'all' || c.status === input.status).sort(compareCandidates);
  const page = limitWithHint(wanted, input.limit, (shown, total) => `showing ${shown} of ${total} — raise limit (max 100)`);
  const result: ConventionsResult = {
    status: 'ok',
    repo,
    scan_sha: scan.sha,
    conventions: page.items.map((c) => toConventionItem(c, input.format, input.status === 'all')),
    shown: page.shown,
    total: page.total,
    untrusted: UNTRUSTED_NOTE.replace('finding text', 'convention text'),
  };
  if (page.hint) result.hint = page.hint;
  return result;
}
