import type {
  EvalLineDiff,
  EvalMetricDelta,
  EvalRunCompare,
  EvalSuiteRunDetail,
} from '@devdigest/shared';
import { EVAL_METRIC_KEYS } from './callout.js';

/** Above this many cells the LCS table is skipped: the middle becomes one delete + one add block. */
const MAX_LCS_CELLS = 4_000_000;

/**
 * Line diff of two texts (LCS), common prefix and suffix peeled off first so the table only covers
 * the part that changed. Pure text in, ops out — the UI renders each line as plain text.
 */
export function lineDiff(oldText: string, newText: string): EvalLineDiff[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) {
    tail += 1;
  }
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  const out: EvalLineDiff[] = a.slice(0, head).map((text) => ({ op: 'same', text }));
  if (midA.length * midB.length > MAX_LCS_CELLS) {
    out.push(...midA.map((text): EvalLineDiff => ({ op: 'del', text })));
    out.push(...midB.map((text): EvalLineDiff => ({ op: 'add', text })));
  } else {
    // lcs[i][j] = LCS length of midA[i:] and midB[j:]
    const lcs: number[][] = Array.from({ length: midA.length + 1 }, () => new Array<number>(midB.length + 1).fill(0));
    for (let i = midA.length - 1; i >= 0; i -= 1) {
      for (let j = midB.length - 1; j >= 0; j -= 1) {
        lcs[i]![j] = midA[i] === midB[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length && j < midB.length) {
      if (midA[i] === midB[j]) {
        out.push({ op: 'same', text: midA[i]! });
        i += 1;
        j += 1;
      } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
        out.push({ op: 'del', text: midA[i]! });
        i += 1;
      } else {
        out.push({ op: 'add', text: midB[j]! });
        j += 1;
      }
    }
    for (; i < midA.length; i += 1) out.push({ op: 'del', text: midA[i]! });
    for (; j < midB.length; j += 1) out.push({ op: 'add', text: midB[j]! });
  }
  out.push(...a.slice(a.length - tail).map((text): EvalLineDiff => ({ op: 'same', text })));
  return out;
}

const skillKey = (s: EvalSuiteRunDetail['skills'][number]) => `${s.id}@${s.version ?? '?'}`;
const change = (oldValue: string | null, newValue: string | null) =>
  oldValue === newValue ? null : { old: oldValue, new: newValue };

/** Earlier `ran_at` is "old" whatever order the caller selected them in (AC-31). */
function ordered(a: EvalSuiteRunDetail, b: EvalSuiteRunDetail): [EvalSuiteRunDetail, EvalSuiteRunDetail] {
  const ta = Date.parse(a.ran_at);
  const tb = Date.parse(b.ran_at);
  if (ta !== tb) return ta < tb ? [a, b] : [b, a];
  return a.id <= b.id ? [a, b] : [b, a];
}

/** Everything the Compare modal shows, computed server-side from two stored runs. */
export function compareRuns(first: EvalSuiteRunDetail, second: EvalSuiteRunDetail): EvalRunCompare {
  const [oldRun, newRun] = ordered(first, second);

  const metrics: EvalMetricDelta[] = EVAL_METRIC_KEYS.map((metric) => {
    const o = oldRun[metric];
    const n = newRun[metric];
    return { metric, old: o, new: n, delta: o == null || n == null ? null : n - o };
  });

  const oldStatus = new Map(oldRun.results.map((r) => [r.case_id, r] as const));
  const flipped_cases = newRun.results.flatMap((r) => {
    const before = oldStatus.get(r.case_id);
    return before && before.status !== r.status
      ? [{ case_id: r.case_id, case_name: r.case_name ?? before.case_name ?? null, old: before.status, new: r.status }]
      : [];
  });

  const oldSkills = oldRun.skills.map(skillKey).sort();
  const newSkills = newRun.skills.map(skillKey).sort();
  const skillsDiffer = oldSkills.join('\n') !== newSkills.join('\n');
  const config_diff = {
    provider: change(oldRun.provider, newRun.provider),
    model: change(oldRun.model, newRun.model),
    strategy: change(oldRun.strategy, newRun.strategy),
    skills: skillsDiffer ? { old: oldSkills, new: newSkills } : null,
  };

  const oldIds = new Set(oldRun.case_ids);
  const newIds = new Set(newRun.case_ids);
  const common = [...newIds].filter((id) => oldIds.has(id)).length;

  return {
    old: oldRun,
    new: newRun,
    same_config:
      oldRun.system_prompt === newRun.system_prompt &&
      !config_diff.provider &&
      !config_diff.model &&
      !config_diff.strategy &&
      !config_diff.skills,
    metrics,
    cost: {
      old: oldRun.cost_usd,
      new: newRun.cost_usd,
      partial: oldRun.cost_partial || newRun.cost_partial,
    },
    passed: {
      old: { passed: oldRun.traces_passed, total: oldRun.traces_total },
      new: { passed: newRun.traces_passed, total: newRun.traces_total },
    },
    flipped_cases,
    config_diff,
    prompt_diff: lineDiff(oldRun.system_prompt, newRun.system_prompt),
    case_set: { common, added: newIds.size - common, removed: oldIds.size - common },
  };
}
