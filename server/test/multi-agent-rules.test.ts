import { describe, it, expect } from 'vitest';
import {
  MAX_MULTI_AGENT_IDS,
  averageEstimate,
  buildLearningContent,
  buildLearningSource,
  findingsLinked,
  groupFindings,
  normalizeAgentIds,
  parentStatus,
  titleTokens,
  titlesSimilar,
  type ColumnStatus,
  type GroupingColumn,
  type GroupingFinding,
} from '../src/modules/reviews/multi-agent.js';
import { AppError } from '../src/platform/errors.js';

/**
 * Pure rules of multi-agent review (spec 2026-10-13-multi-agent-review.md):
 * agent-id validation (AC-11), grouping (AC-18), takes + conflict predicate
 * (AC-20/21), parent status (AC-13), estimates (AC-6), Learn content/provenance
 * (AC-35/36). Zero I/O; expected values are worked out by hand from the spec.
 */

let seq = 0;
function finding(over: Partial<GroupingFinding> & { runId: string }): GroupingFinding {
  seq += 1;
  return {
    id: `f${seq}`,
    severity: 'WARNING',
    category: 'bug',
    title: `Unrelated title number ${seq}`,
    file: 'src/a.ts',
    startLine: 10,
    endLine: 10,
    rationale: `why ${seq}`,
    ...over,
  };
}

function col(runId: string, status: ColumnStatus = 'done', agentName = `Agent ${runId}`): GroupingColumn {
  return { runId, agentId: `agent-${runId}`, agentName, status };
}

describe('normalizeAgentIds (AC-11, edge cases)', () => {
  const thrown = (fn: () => unknown): AppError => {
    try {
      fn();
    } catch (e) {
      return e as AppError;
    }
    throw new Error('expected normalizeAgentIds to throw');
  };

  it('drops duplicates and keeps the order of first occurrence', () => {
    expect(normalizeAgentIds({ agentIds: ['c', 'a', 'c', 'b', 'a'] })).toEqual(['c', 'a', 'b']);
  });

  it('accepts exactly 10 distinct ids, and 12 entries that collapse to 10', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `id${i}`);
    expect(MAX_MULTI_AGENT_IDS).toBe(10);
    expect(normalizeAgentIds({ agentIds: ten })).toEqual(ten);
    expect(normalizeAgentIds({ agentIds: [...ten, 'id0', 'id1'] })).toEqual(ten);
  });

  it.each([
    ['an empty list', { agentIds: [] as string[] }],
    ['11 distinct ids', { agentIds: Array.from({ length: 11 }, (_, i) => `id${i}`) }],
    ['agent_ids mixed with agentId', { agentIds: ['a'], agentId: 'b' }],
    ['agent_ids mixed with all:true', { agentIds: ['a'], all: true }],
  ])('rejects %s with 400 invalid_run_request', (_label, opts) => {
    const err = thrown(() => normalizeAgentIds(opts));
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('invalid_run_request');
    expect(err.statusCode).toBe(400);
  });

  it('treats all:false as not mixed', () => {
    expect(normalizeAgentIds({ agentIds: ['a'], all: false })).toEqual(['a']);
  });
});

describe('title similarity (AC-18)', () => {
  it('normalizes: lowercase, split on non-alphanumerics, drop tokens shorter than 3', () => {
    expect([...titleTokens('Retry-After header omitted on 429')].sort()).toEqual(
      ['429', 'after', 'header', 'omitted', 'retry'].sort(),
    );
  });

  it.each([
    // 4 vs 6 tokens, 4 shared -> 4/6 = 0.67
    ['Missing rate limit on login', 'Rate limit missing for login endpoint', true],
    // exactly at the threshold: 2 shared / max(4,4) = 0.5
    ['alpha beta gamma delta', 'alpha beta zeta theta', true],
    // just below: 2 shared / max(4,5) = 0.4
    ['alpha beta gamma delta', 'alpha beta zeta theta eta', false],
    // spec example: only "429" shared, 1 / 7 = 0.14
    ['Retry-After header omitted on 429', '429 body has no machine-readable error code', false],
    // punctuation / case are irrelevant: {sql, injection} vs {sql, injection, risk} = 2/3
    ['SQL Injection', 'sql-injection risk', true],
    // two titles with no token of 3+ chars are never similar
    ['a b', 'a b', false],
  ])('%j vs %j -> %s', (a, b, expected) => {
    expect(titlesSimilar(a, b)).toBe(expected);
  });
});

describe('findingsLinked (AC-18 direct link)', () => {
  const base = { file: 'src/a.ts', category: 'security', startLine: 52, endLine: 52 };

  it.each([
    ['same spot, same category', {}, {}, true],
    ['same run is never a direct pair', {}, { runId: 'A' }, false],
    ['different file', {}, { file: 'src/b.ts' }, false],
    ['start lines 2 apart (no overlap), same category', { startLine: 10, endLine: 10 }, { startLine: 12, endLine: 12 }, true],
    ['start lines 3 apart (no overlap), same category', { startLine: 10, endLine: 10 }, { startLine: 13, endLine: 13 }, false],
    ['ranges overlap although starts are far apart', { startLine: 10, endLine: 30 }, { startLine: 25, endLine: 26 }, true],
    [
      'adjacent lines, different category and unrelated titles (:27 vs :28)',
      { startLine: 27, endLine: 27, title: 'Pipeline INCR and EXPIRE are not atomic' },
      { startLine: 28, endLine: 28, category: 'style', title: 'Magic number 3600 should be a constant' },
      false,
    ],
    [
      'different category but similar titles',
      { title: 'Retry-After header omitted on 429' },
      { category: 'api', title: 'Retry-After header missing on 429 response' },
      true,
    ],
  ])('%s -> %s', (_label, aOver, bOver, expected) => {
    const a = finding({ ...base, title: 'first thing here', runId: 'A', ...aOver });
    const b = finding({ ...base, title: 'second other words', runId: 'B', ...bOver });
    expect(findingsLinked(a, b)).toBe(expected);
  });
});

describe('groupFindings: grouping (AC-18)', () => {
  const columns = [col('A'), col('B'), col('C')];

  it('puts the same issue at :52 from two agents into one group and keeps both authors', () => {
    const a = finding({ runId: 'A', startLine: 52, endLine: 52, category: 'api', title: 'Retry-After header omitted on 429' });
    const b = finding({ runId: 'B', startLine: 52, endLine: 52, category: 'api', title: 'No Retry-After on 429 response' });
    const groups = groupFindings(columns, [a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members.map((m) => m.finding_id)).toEqual([a.id, b.id]);
    expect(groups[0]!.members.map((m) => m.agent_name)).toEqual(['Agent A', 'Agent B']);
    expect(groups[0]).toMatchObject({ file: 'src/a.ts', line: 52, end_line: 52 });
  });

  it('keeps :27 and :28 apart when category and titles differ, and keeps singletons', () => {
    const a = finding({ runId: 'A', startLine: 27, endLine: 27, category: 'bug', title: 'Pipeline INCR and EXPIRE are not atomic' });
    const b = finding({ runId: 'B', startLine: 28, endLine: 28, category: 'style', title: 'Magic number 3600 should be a constant' });
    const groups = groupFindings(columns, [a, b]);
    expect(groups.map((g) => g.members.map((m) => m.finding_id))).toEqual([[a.id], [b.id]]);
  });

  it('never links two findings of one agent directly', () => {
    const a1 = finding({ runId: 'A', startLine: 10, endLine: 10, category: 'bug' });
    const a2 = finding({ runId: 'A', startLine: 10, endLine: 10, category: 'bug' });
    expect(groupFindings(columns, [a1, a2])).toHaveLength(2);
  });

  it('joins A1 and A2 through B1: A1~B1 and A2~B1 give one group of three', () => {
    const a1 = finding({ runId: 'A', startLine: 10, endLine: 10, category: 'bug' });
    const a2 = finding({ runId: 'A', startLine: 12, endLine: 12, category: 'bug' });
    const b1 = finding({ runId: 'B', startLine: 11, endLine: 11, category: 'bug' });
    // sanity of the premise: A1 and A2 are not a direct pair
    expect(findingsLinked(a1, a2)).toBe(false);
    const groups = groupFindings(columns, [a1, a2, b1]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members.map((m) => m.finding_id).sort()).toEqual([a1.id, a2.id, b1.id].sort());
    expect(groups[0]).toMatchObject({ line: 10, end_line: 12 });
  });

  it('closes transitively: A~B and B~C give one group although A and C are not linked', () => {
    const a = finding({ runId: 'A', startLine: 10, endLine: 10, category: 'bug' });
    const b = finding({ runId: 'B', startLine: 12, endLine: 12, category: 'bug' });
    const c = finding({ runId: 'C', startLine: 14, endLine: 14, category: 'bug' });
    expect(findingsLinked(a, c)).toBe(false);
    expect(groupFindings(columns, [a, b, c])).toHaveLength(1);
  });

  it('never groups across files and sorts groups by file then line', () => {
    const late = finding({ runId: 'A', file: 'src/b.ts', startLine: 5, endLine: 5, category: 'bug' });
    const twin = finding({ runId: 'B', file: 'src/a.ts', startLine: 40, endLine: 40, category: 'bug' });
    const early = finding({ runId: 'C', file: 'src/a.ts', startLine: 3, endLine: 3, category: 'perf', title: 'zzz yyy xxx' });
    const groups = groupFindings(columns, [late, twin, early]);
    expect(groups.map((g) => [g.file, g.line])).toEqual([
      ['src/a.ts', 3],
      ['src/a.ts', 40],
      ['src/b.ts', 5],
    ]);
  });

  it('names a group after its highest-severity member', () => {
    const warn = finding({ runId: 'A', severity: 'WARNING', title: 'Warning flavoured title' });
    const crit = finding({ runId: 'B', severity: 'CRITICAL', title: 'Critical flavoured title' });
    expect(groupFindings(columns, [warn, crit])[0]!.title).toBe('Critical flavoured title');
  });

  it('breaks a severity tie by column order, not by input order', () => {
    const fromB = finding({ runId: 'B', severity: 'WARNING', title: 'Title from agent B' });
    const fromA = finding({ runId: 'A', severity: 'WARNING', title: 'Title from agent A' });
    expect(groupFindings(columns, [fromB, fromA])[0]!.title).toBe('Title from agent A');
  });

  it('reports agent_id null when the column has no agent id (deleted agent)', () => {
    const f = finding({ runId: 'A' });
    const cols = [{ runId: 'A', agentId: '', agentName: 'Gone agent', status: 'done' as const }];
    expect(groupFindings(cols, [f])[0]!.members[0]).toMatchObject({ agent_id: null, agent_name: 'Gone agent' });
  });

  it('does not mutate the findings it reads', () => {
    const a = finding({ runId: 'A' });
    const b = finding({ runId: 'B' });
    const before = JSON.stringify([a, b]);
    groupFindings(columns, [a, b]);
    expect(JSON.stringify([a, b])).toBe(before);
  });
});

describe('groupFindings: takes and is_conflict (AC-20, AC-21)', () => {
  const flag = (runId: string, severity: GroupingFinding['severity'] = 'WARNING') =>
    finding({ runId, severity, category: 'bug', startLine: 20, endLine: 20, rationale: `${runId} says so` });

  it('builds one take per column of the parent run: flagged / did not flag / failed / cancelled / pending', () => {
    const columns = [
      col('A', 'done'),
      col('B', 'done'),
      col('C', 'failed'),
      col('D', 'cancelled'),
      col('E', 'running'),
      col('F', 'queued'),
    ];
    const [group] = groupFindings(columns, [flag('A', 'CRITICAL')]);
    expect(group!.takes).toEqual([
      { agent_id: 'agent-A', persona: 'Agent A', verdict: 'CRITICAL', note: 'A says so' },
      { agent_id: 'agent-B', persona: 'Agent B', verdict: 'ignored', note: '' },
      { agent_id: 'agent-C', persona: 'Agent C', verdict: 'failed', note: '' },
      { agent_id: 'agent-D', persona: 'Agent D', verdict: 'cancelled', note: '' },
      { agent_id: 'agent-E', persona: 'Agent E', verdict: 'pending', note: '' },
      { agent_id: 'agent-F', persona: 'Agent F', verdict: 'pending', note: '' },
    ]);
  });

  it('takes the highest severity when one agent has several members in the group', () => {
    const columns = [col('A'), col('B')];
    const a1 = finding({ runId: 'A', severity: 'SUGGESTION', category: 'bug', startLine: 10, endLine: 10 });
    const a2 = finding({ runId: 'A', severity: 'CRITICAL', category: 'bug', startLine: 12, endLine: 12 });
    const b1 = finding({ runId: 'B', severity: 'CRITICAL', category: 'bug', startLine: 11, endLine: 11 });
    const [group] = groupFindings(columns, [a1, a2, b1]);
    expect(group!.takes.map((t) => t.verdict)).toEqual(['CRITICAL', 'CRITICAL']);
    expect(group!.is_conflict).toBe(false);
  });

  it.each<[string, GroupingColumn[], GroupingFinding[], boolean]>([
    ['one flags, one completed without flagging', [col('A'), col('B')], [flag('A')], true],
    ['all flag with the same severity', [col('A'), col('B')], [flag('A'), flag('B')], false],
    ['flagging agents disagree on severity', [col('A'), col('B')], [flag('A', 'CRITICAL'), flag('B', 'WARNING')], true],
    ['the other agent failed (not "did not flag")', [col('A'), col('B', 'failed')], [flag('A')], false],
    ['the other agent was cancelled', [col('A'), col('B', 'cancelled')], [flag('A')], false],
    ['the other agent is still running', [col('A'), col('B', 'running')], [flag('A')], false],
    ['a failed agent is ignored but a done one still did not flag', [col('A'), col('B', 'failed'), col('C')], [flag('A')], true],
    ['pending agent does not hide a severity disagreement', [col('A'), col('B'), col('C', 'running')], [flag('A', 'CRITICAL'), flag('B', 'SUGGESTION')], true],
    ['single agent, single finding', [col('A')], [flag('A')], false],
  ])('%s -> is_conflict %s', (_label, columns, findings, expected) => {
    const groups = groupFindings(columns, findings);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.is_conflict).toBe(expected);
  });
});

describe('parentStatus (AC-13)', () => {
  it.each<[ColumnStatus[], ReturnType<typeof parentStatus>]>([
    [['running', 'done'], 'running'],
    [['queued', 'done', 'failed'], 'running'],
    [['done'], 'done'],
    [['done', 'done', 'done'], 'done'],
    [['failed'], 'failed'],
    [['failed', 'cancelled'], 'failed'],
    [['done', 'failed'], 'partial'],
    [['done', 'cancelled', 'failed'], 'partial'],
  ])('%j -> %s', (statuses, expected) => {
    expect(parentStatus(statuses)).toBe(expected);
  });
});

describe('averageEstimate (AC-6, AC-8)', () => {
  it('returns nulls when there is no history', () => {
    expect(averageEstimate([])).toEqual({ est_duration_ms: null, est_cost_usd: null });
  });

  it('averages duration (rounded) and cost, leaving null costs out of the cost average only', () => {
    // durations 1000+2000+4000 = 7000 / 3 = 2333.33 -> 2333; costs (0.01+0.03)/2 = 0.02
    const est = averageEstimate([
      { durationMs: 1000, costUsd: 0.01 },
      { durationMs: 2000, costUsd: null },
      { durationMs: 4000, costUsd: 0.03 },
    ]);
    expect(est.est_duration_ms).toBe(2333);
    expect(est.est_cost_usd).toBeCloseTo(0.02, 10);
  });

  it('keeps the duration estimate when no run has a cost, and the cost null (never 0)', () => {
    expect(
      averageEstimate([
        { durationMs: 3000, costUsd: null },
        { durationMs: 5000, costUsd: null },
      ]),
    ).toEqual({ est_duration_ms: 4000, est_cost_usd: null });
  });
});

describe('Learn content and provenance (AC-35, AC-36)', () => {
  it('builds content from title, file:line and rationale, plus the suggestion when present', () => {
    const f = { title: 'Hardcoded key', file: 'src/config.ts', startLine: 11, rationale: 'A live key is committed.' };
    expect(buildLearningContent({ ...f, suggestion: 'Use an env var.' })).toBe(
      'Hardcoded key\n\nsrc/config.ts:11\n\nA live key is committed.\n\nSuggestion: Use an env var.',
    );
    expect(buildLearningContent({ ...f, suggestion: null })).toBe(
      'Hardcoded key\n\nsrc/config.ts:11\n\nA live key is committed.',
    );
    expect(buildLearningContent({ ...f, suggestion: '' })).not.toContain('Suggestion');
  });

  it('records full provenance and marks the content as agent output', () => {
    const learnedAt = new Date('2026-10-14T10:00:00.000Z');
    expect(
      buildLearningSource({
        prNumber: 482,
        findingId: 'fin-1',
        prId: 'pr-1',
        runId: 'run-1',
        multiAgentRunId: 'par-1',
        agentId: 'ag-1',
        agentName: 'Security',
        decision: 'dismissed',
        learnedAt,
      }),
    ).toEqual({
      pr: 482,
      context: 'Learned from a finding by Security on PR #482',
      finding_id: 'fin-1',
      pr_id: 'pr-1',
      run_id: 'run-1',
      multi_agent_run_id: 'par-1',
      agent_id: 'ag-1',
      agent_name: 'Security',
      decision: 'dismissed',
      learned_at: '2026-10-14T10:00:00.000Z',
      origin: 'agent_output',
    });
  });

  it('omits run / parent / agent keys when they are unknown (single-agent run, deleted agent)', () => {
    const source = buildLearningSource({
      prNumber: 7,
      findingId: 'fin-2',
      prId: 'pr-2',
      runId: null,
      multiAgentRunId: null,
      agentId: null,
      agentName: null,
      decision: 'undecided',
      learnedAt: new Date('2026-10-14T10:00:00.000Z'),
    });
    expect(source).toEqual({
      pr: 7,
      context: 'Learned from a finding on PR #7',
      finding_id: 'fin-2',
      pr_id: 'pr-2',
      decision: 'undecided',
      learned_at: '2026-10-14T10:00:00.000Z',
      origin: 'agent_output',
    });
    expect(source).not.toHaveProperty('multi_agent_run_id');
  });
});
