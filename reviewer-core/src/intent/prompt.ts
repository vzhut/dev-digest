import type { ChatMessage } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '../prompt.js';
import {
  MAX_DESCRIPTION_CHARS,
  MAX_FILES,
  MAX_HUNK_HEADERS,
  MAX_HUNK_HEADER_CHARS,
  MAX_ITEM_CHARS,
  MAX_LIST_ITEMS,
  MAX_TITLE_CHARS,
  MAX_UNTRUSTED_CHARS,
} from './constants.js';
import type { IntentPromptInput, PromptComponent } from './types.js';

const INTENT_SYSTEM =
  'You classify what a pull request INTENDS to change. You do not review code and you ' +
  'never see the diff — only the PR metadata below.\n' +
  'Return: `intent` (one sentence summary), `in_scope` (what the PR is meant to change), ' +
  '`out_of_scope` (what the PR explicitly leaves out), `risk_areas` (areas a reviewer should ' +
  `look at closely). At most ${MAX_LIST_ITEMS} items per list, each at most ${MAX_ITEM_CHARS} characters.\n` +
  'Be specific to THIS pull request and stay grounded in the text you were given:\n' +
  '- `in_scope`: only what the title, description, linked sources or file paths actually show. ' +
  'Do not infer a behaviour from a file name alone.\n' +
  '- `out_of_scope`: only what the description or a linked source explicitly excludes or defers. ' +
  'If nothing is excluded, return an empty list. Never add generic exclusions such as "UI changes", ' +
  '"documentation or tests" or "other features".\n' +
  '- `risk_areas`: only risks tied to the named files or described behaviour, not a generic checklist ' +
  'for this kind of change. Fewer specific items beat a full list; an empty list is fine.\n' +
  'The lists do not need to reach the maximum length.\n' +
  'If a source is listed under "Unavailable context", do NOT guess or invent its content; ' +
  'say the scope is uncertain instead.';

/** Only real hunk header lines survive — this is what keeps diff bodies out. */
const HUNK_HEADER = /^@@ .* @@/;

function oneLine(s: string, max: number): string {
  return s.replace(/[\r\n]+/g, ' ').slice(0, max);
}

/** Attribute-safe label: refs are author-influenced, so keep them out of the tag syntax. */
function safeLabel(s: string): string {
  return s.replace(/[^\w./:#@-]/g, '_').slice(0, 80);
}

export interface IntentPrompt {
  messages: ChatMessage[];
  /** Names + sizes only, for logging. */
  components: PromptComponent[];
}

/**
 * Build the classifier prompt. Every author/fetched text is delimiter-wrapped as
 * untrusted; the "Unavailable context" list is trusted (built by our resolver)
 * but sanitised to single lines. No diff bodies: hunk headers only.
 */
export function buildIntentPrompt(input: IntentPromptInput): IntentPrompt {
  const components: PromptComponent[] = [];
  const blocks: string[] = [];
  const add = (name: string, label: string, text: string, source: string) => {
    components.push({ name, chars: text.length, source });
    blocks.push(`### ${name}\n${wrapUntrusted(label, text)}`);
  };

  const title = input.title.slice(0, MAX_TITLE_CHARS);
  add('PR title', 'pr-title', title, 'pr-author');

  let budget = MAX_UNTRUSTED_CHARS;
  const description = input.description.trim().slice(0, Math.min(MAX_DESCRIPTION_CHARS, budget));
  budget -= description.length;
  add('PR description', 'pr-description', description || '(no description provided)', 'pr-author');

  const files = input.files
    .slice(0, MAX_FILES)
    .map((f) =>
      f.additions != null && f.deletions != null
        ? `${oneLine(f.path, 200)} (+${f.additions}/-${f.deletions})`
        : oneLine(f.path, 200),
    );
  add('Changed files', 'file-list', files.length ? files.join('\n') : '(file list not loaded)', 'git-metadata');

  const headers = input.hunkHeaders
    .filter((h) => HUNK_HEADER.test(h))
    .slice(0, MAX_HUNK_HEADERS)
    .map((h) => oneLine(h, MAX_HUNK_HEADER_CHARS));
  add('Hunk headers', 'hunk-headers', headers.length ? headers.join('\n') : '(none)', 'git-metadata');

  for (const s of input.sources) {
    if (budget <= 0) break;
    const text = s.text.slice(0, budget);
    budget -= text.length;
    const ref = safeLabel(s.ref);
    add(`Linked source ${ref}`, `intent-src:${s.kind}:${ref}`, text, s.kind);
  }

  const unavailable = input.unavailable.map(
    (u) => `- ${oneLine(u.ref, 120)} (${u.status}): ${oneLine(u.reason, 120)}`,
  );
  let user = `PR${input.prNumber != null ? ` #${input.prNumber}` : ''} — classify its intent.\n\n${blocks.join('\n\n')}`;
  if (unavailable.length > 0) {
    const list = unavailable.join('\n');
    components.push({ name: 'Unavailable context', chars: list.length, source: 'intent-resolver' });
    user += `\n\n## Unavailable context\n${list}`;
  }

  const system = `${INTENT_SYSTEM}\n\n${INJECTION_GUARD}`;
  components.unshift({ name: 'system', chars: system.length, source: 'classifier-prompt' });
  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    components,
  };
}
