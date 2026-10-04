import type { BlastRadius, ChatMessage, Intent } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '@devdigest/reviewer-core';
import { SMART_DIFF_ROLE_ORDER } from '../_shared/smart-diff-role.js';
import {
  BLAST_CAP,
  DIFF_STATS_CAP,
  ISSUE_CAP,
  MAX_CALLER_FILES,
  MAX_DIFF_FILES,
  MAX_PROMPT_LINE_CHARS,
  MAX_RANGES_PER_FILE,
  PROMPT_TOKEN_BUDGET,
  SPECS_CAP,
  SPECS_CHAR_PRECAP,
  TEXT_CHAR_PRECAP,
  TITLE_DESCRIPTION_CAP,
} from './constants.js';
import { callerFiles, type DiffStat } from './helpers.js';

/**
 * Prompt assembly for the one risk-brief LLM call (spec AC-9, AC-10, AC-13, AC-36).
 * Pure: the token counter is injected. The model sees facts only: never a hunk
 * body, never the text after a hunk header's `@@ ... @@` (see `toDiffStats`).
 * Every untrusted text goes through `wrapUntrusted` and `INJECTION_GUARD` is
 * appended to the system message.
 *
 * Budget: each section is capped on its WRAPPED text (tags and labels count).
 * The system message gets what the caps leave over (`SYSTEM_MESSAGE_BUDGET`).
 * If the total is still above `PROMPT_TOKEN_BUDGET` (an Intent larger than its
 * allowance, or separator overhead) sections shrink in this order: specs,
 * issue body, description, callers, diff statistics. The title, the Intent and
 * the blast summary are never cut, and there is no over-budget failure path.
 *
 * `RISK_BRIEF_SYSTEM_PROMPT` mirrors `src/prompts/risk-brief.system.md` (tsc does
 * not copy .md into dist, so the text is embedded and a test keeps them equal).
 */
export const RISK_BRIEF_SYSTEM_PROMPT = `You write a pull-request risk brief for a code reviewer, as structured JSON.

You are given computed FACTS about ONE pull request: its title and description, the linked issue,
the derived intent, the blast radius (summary and caller files), per-file diff statistics (path,
role, additions, deletions, changed line ranges) and attached project specs. You never see code.
Some facts can be absent; work with what is there and do not guess the rest.

Produce exactly these parts:
1. summary: 1-600 characters. What the PR does and why.
2. risks: 0-6 items {kind, title, explanation, severity, file_refs}. severity is high, medium or
   low. file_refs holds 1-3 strings, each \`path\`, \`path:line\` or \`path:start-end\`.
3. review_focus: 0-6 items {file, line, reason}: the places to read first. line is a whole number
   of at least 1; prefer a line inside a changed range from the diff statistics.

Grounding rules (strict):
- Every path in file_refs and review_focus MUST appear in the diff statistics or the blast radius
  input. Copy it verbatim. Never invent a path, symbol, line or fact.
- Prefer few, specific, evidence-based risks over many vague ones. Return an empty list when
  nothing stands out.
- Output is plain text only: no Markdown links, no HTML, no code fences.`;

/** The exact system message that is sent. */
export const riskBriefSystemMessage = (): string => `${RISK_BRIEF_SYSTEM_PROMPT}\n\n${INJECTION_GUARD}`;

export type TokenCounter = (text: string) => number;

/** Everything the model may see (AC-9). All of it is computed, none of it is a diff body. */
export interface BriefFacts {
  title: string;
  description: string | null;
  issue: { title: string; body: string } | null;
  intent: Intent | null;
  blast: BlastRadius | null;
  files: DiffStat[];
  specs: { path: string; text: string }[];
}

export interface BriefPromptComponent {
  name: string;
  source: 'trusted' | 'untrusted';
  chars: number;
  tokens: number;
}

export interface BriefPrompt {
  messages: ChatMessage[];
  components: BriefPromptComponent[];
  /** Tokens of system + user text as sent, measured by the injected counter. */
  tokens: number;
  /** Sections that were cut: any of `specs`, `issue`, `description`, `callers`, `diff_stats`. */
  truncated: string[];
}

const oneLine = (s: string): string => {
  const flat = s.replace(/[\r\n\t]+/g, ' ');
  return flat.length > MAX_PROMPT_LINE_CHARS ? flat.slice(0, MAX_PROMPT_LINE_CHARS) : flat;
};

/** A doc path is the `source` attribute: `wrapUntrusted` escapes quotes but not angle brackets, so a `</untrusted>` in a path would read as a closing tag. */
const labelOf = (path: string): string => oneLine(path).replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * Largest n in [0, max] whose rendering fits `limit` tokens. Interpolation
 * search: token counts are near-linear in n, so a handful of counts is enough
 * (js-tiktoken is slow on big texts). The result always fits unless n = 0 does
 * not, and may undershoot the true maximum by ~1% of max.
 */
function fitLargest(max: number, limit: number, measure: (n: number) => number): number {
  if (measure(max) <= limit) return max;
  let lo = 0;
  let tLo = measure(0);
  if (tLo > limit) return 0;
  let hi = max;
  let tHi = measure(max);
  for (let i = 0; i < 14 && hi - lo > Math.max(1, Math.floor(hi * 0.01)); i += 1) {
    const guess = Math.round(lo + ((hi - lo) * (limit - tLo)) / (tHi - tLo));
    const mid = Math.min(hi - 1, Math.max(lo + 1, guess));
    const t = measure(mid);
    if (t <= limit) {
      lo = mid;
      tLo = t;
    } else {
      hi = mid;
      tHi = t;
    }
  }
  return lo;
}

interface Section {
  name: string;
  /** Key recorded in `truncated` when the section was cut. */
  truncKey: string | null;
  /** Units that can be kept (chars, callers, files); 0 for a section that is never cut. */
  max: number;
  /** Extra truncation that happened before fitting (pre-caps, list caps). */
  preCut: boolean;
  build: (n: number) => string;
  cap: number | null;
  // fitted state
  n: number;
  text: string;
  tokens: number;
}

function makeSection(
  s: Pick<Section, 'name' | 'truncKey' | 'max' | 'preCut' | 'build' | 'cap'>,
  count: TokenCounter,
): Section {
  const sec: Section = { ...s, n: s.max, text: '', tokens: 0 };
  fit(sec, s.cap, count);
  return sec;
}

/** (Re)fit a section to `limit` tokens (null = keep whole). */
function fit(sec: Section, limit: number | null, count: TokenCounter): void {
  const memo = new Map<number, { text: string; tokens: number }>();
  const at = (n: number) => {
    let hit = memo.get(n);
    if (!hit) {
      const text = sec.build(n);
      hit = { text, tokens: text.length === 0 ? 0 : count(text) };
      memo.set(n, hit);
    }
    return hit;
  };
  sec.n = limit === null || sec.max === 0 ? sec.max : fitLargest(sec.max, limit, (n) => at(n).tokens);
  const done = at(sec.n);
  sec.text = done.text;
  sec.tokens = done.tokens;
}

const wasCut = (s: Section): boolean => s.preCut || s.n < s.max;

function intentText(i: Intent): string {
  const list = (title: string, items: readonly string[] | null | undefined) =>
    items && items.length > 0 ? `\n${title}:\n${items.map((x) => `- ${x}`).join('\n')}` : '';
  return `Intent: ${i.intent}${list('In scope', i.in_scope)}${list('Out of scope', i.out_of_scope)}${list('Risk areas', i.risk_areas)}`;
}

const ranges = (r: DiffStat['ranges']): string =>
  r
    .slice(0, MAX_RANGES_PER_FILE)
    .map((x) => (x.start === x.end ? `${x.start}` : `${x.start}-${x.end}`))
    .join(', ') + (r.length > MAX_RANGES_PER_FILE ? ', ...' : '');

function sortedForPrompt(files: readonly DiffStat[]): DiffStat[] {
  const rank = (d: DiffStat) => SMART_DIFF_ROLE_ORDER.indexOf(d.role);
  return [...files].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.additions + b.deletions - (a.additions + a.deletions) ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
}

/** Assemble the system + user messages for the single structured call. */
export function buildRiskBriefPrompt(facts: BriefFacts, count: TokenCounter): BriefPrompt {
  const system = riskBriefSystemMessage();

  // ---- sections (each a pure function of "how much to keep") ----
  const description = (facts.description ?? '').trim();
  const descKept = description.slice(0, TEXT_CHAR_PRECAP);
  const pr = makeSection(
    {
      name: 'pull_request',
      truncKey: 'description',
      max: descKept.length,
      preCut: descKept.length < description.length,
      cap: TITLE_DESCRIPTION_CAP,
      build: (n) =>
        `## Pull request\n${wrapUntrusted('pr_title', facts.title)}` +
        (n > 0 ? `\n${wrapUntrusted('pr_description', descKept.slice(0, n))}` : ''),
    },
    count,
  );

  const issueBody = facts.issue ? facts.issue.body.slice(0, TEXT_CHAR_PRECAP) : '';
  const issue = makeSection(
    {
      name: 'linked_issue',
      truncKey: 'issue',
      max: issueBody.length,
      preCut: facts.issue !== null && issueBody.length < facts.issue.body.length,
      cap: ISSUE_CAP,
      build: (n) =>
        facts.issue
          ? `## Linked issue\n${wrapUntrusted('linked_issue', `${facts.issue.title}\n\n${issueBody.slice(0, n)}`.trimEnd())}`
          : '',
    },
    count,
  );

  const intent = makeSection(
    {
      name: 'intent',
      truncKey: null,
      max: 0,
      preCut: false,
      cap: null, // INTENT_CAP is an allowance, not a limit (D4)
      build: () => (facts.intent ? `## Intent\n${wrapUntrusted('intent', intentText(facts.intent))}` : ''),
    },
    count,
  );

  const callers = callerFiles(facts.blast);
  const blast = makeSection(
    {
      name: 'blast_radius',
      truncKey: 'callers',
      max: Math.min(MAX_CALLER_FILES, callers.length),
      preCut: callers.length > MAX_CALLER_FILES,
      cap: BLAST_CAP,
      build: (n) =>
        facts.blast
          ? `## Blast radius\n${wrapUntrusted(
              'blast_radius',
              facts.blast.summary +
                (n > 0 ? `\nCaller files:\n${callers.slice(0, n).map((c) => `- ${oneLine(c)}`).join('\n')}` : ''),
            )}`
          : '',
    },
    count,
  );

  const sorted = sortedForPrompt(facts.files);
  const lines = sorted.map((d) => {
    const r = ranges(d.ranges);
    return `${oneLine(d.path)} | ${d.role} | +${d.additions} -${d.deletions}${r ? ` | lines ${r}` : ''}`;
  });
  // suffix[i] = additions/deletions of sorted[i..], for the "+N more files" line
  const suffix: { a: number; d: number }[] = new Array(sorted.length + 1);
  suffix[sorted.length] = { a: 0, d: 0 };
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    suffix[i] = { a: suffix[i + 1]!.a + sorted[i]!.additions, d: suffix[i + 1]!.d + sorted[i]!.deletions };
  }
  const diff = makeSection(
    {
      name: 'diff_stats',
      truncKey: 'diff_stats',
      max: Math.min(MAX_DIFF_FILES, sorted.length),
      preCut: sorted.length > MAX_DIFF_FILES,
      cap: DIFF_STATS_CAP,
      build: (n) => {
        const more = sorted.length - n;
        const body = [
          ...lines.slice(0, n),
          ...(more > 0 ? [`+${more} more files (${suffix[n]!.a} additions, ${suffix[n]!.d} deletions)`] : []),
        ];
        return `## Diff statistics (path | role | additions deletions | new-side changed lines)\n${wrapUntrusted('diff_stats', body.length > 0 ? body.join('\n') : '(none)')}`;
      },
    },
    count,
  );

  // specs: one virtual text of `max` chars; whole documents from the front, the last one cut, the rest dropped
  let room = SPECS_CHAR_PRECAP;
  const docs: { path: string; text: string }[] = [];
  let docsPreCut = false;
  for (const d of facts.specs) {
    const text = d.text.slice(0, room);
    if (text.length < d.text.length) docsPreCut = true;
    if (text.length === 0) {
      docsPreCut = true;
      continue;
    }
    docs.push({ path: d.path, text });
    room -= text.length;
  }
  const specs = makeSection(
    {
      name: 'specs',
      truncKey: 'specs',
      max: docs.reduce((sum, d) => sum + d.text.length, 0),
      preCut: docsPreCut,
      cap: SPECS_CAP,
      build: (n) => {
        let left = n;
        const blocks: string[] = [];
        for (const d of docs) {
          if (left <= 0) break;
          const take = Math.min(left, d.text.length);
          blocks.push(wrapUntrusted(labelOf(d.path), d.text.slice(0, take)));
          left -= take;
        }
        return blocks.length > 0 ? `## Attached specs\n${blocks.join('\n')}` : '';
      },
    },
    count,
  );

  // ---- assemble, then shrink if the whole is still over budget ----
  const ordered = [pr, issue, intent, blast, diff, specs];
  const userText = (): string =>
    ['Write the risk brief from the FACTS below.', ...ordered.map((s) => s.text).filter((t) => t.length > 0)].join('\n\n');
  let total = count(`${system}\n${userText()}`);
  for (const sec of [specs, issue, pr, blast, diff]) {
    if (total <= PROMPT_TOKEN_BUDGET) break;
    if (sec.max === 0 || sec.tokens === 0) continue;
    fit(sec, Math.max(0, sec.tokens - (total - PROMPT_TOKEN_BUDGET)), count);
    total = count(`${system}\n${userText()}`);
  }

  const user = userText();
  const truncated = [specs, issue, pr, blast, diff]
    .filter((s) => s.truncKey !== null && wasCut(s))
    .map((s) => s.truncKey!);
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    components: [
      { name: 'system', source: 'trusted', chars: system.length, tokens: count(system) },
      ...ordered.filter((s) => s.text.length > 0).map((s) => ({
        name: s.name,
        source: 'untrusted' as const,
        chars: s.text.length,
        tokens: s.tokens,
      })),
    ],
    tokens: total,
    truncated,
  };
}
