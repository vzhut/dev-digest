import type { FindingInput, ReviewInput, RunInput } from '../../src/format/findings.js';
import type { CandidateInput } from '../../src/format/conventions.js';
import type { SeverityName } from '../../src/contracts.js';

const SEVS: SeverityName[] = ['SUGGESTION', 'WARNING', 'CRITICAL', 'SUGGESTION', 'SUGGESTION'];

export function makeFinding(i: number, over: Partial<FindingInput> = {}): FindingInput {
  return {
    id: `f-${i}`,
    severity: SEVS[i % SEVS.length] ?? 'SUGGESTION',
    category: 'bug',
    title: `Finding number ${i} about something in the diff`,
    file: `src/module-${i % 7}/file-${i % 13}.ts`,
    start_line: 10 + (i % 50),
    end_line: 12 + (i % 50),
    rationale: `Rationale for finding ${i}. `.repeat(12),
    suggestion: `Use a safer approach for ${i}.`,
    scope: i % 2 === 0 ? 'in_scope' : null,
    dismissed_at: null,
    ...over,
  };
}

export function makeFindings(n: number): FindingInput[] {
  return Array.from({ length: n }, (_, i) => makeFinding(i));
}

export function makeReview(over: Partial<ReviewInput> = {}): ReviewInput {
  return {
    id: 'rev-1',
    agent_id: 'agent-1',
    agent_name: 'General reviewer',
    run_id: 'run-1',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'Summary of the review.',
    score: 42,
    grounding: '143/143 passed',
    cost_usd: 0.0123,
    created_at: '2026-09-26T10:00:00.000Z',
    findings: makeFindings(143),
    ...over,
  };
}

export function makeRun(over: Partial<RunInput> = {}): RunInput {
  return {
    run_id: 'run-1',
    agent_id: 'agent-1',
    agent_name: 'General reviewer',
    status: 'done',
    error: null,
    cost_usd: 0.0123,
    grounding: '143/143 passed',
    ran_at: '2026-09-26T10:00:00.000Z',
    score: 42,
    blockers: 7,
    ...over,
  };
}

export function makeCandidate(i: number, over: Partial<CandidateInput> = {}): CandidateInput {
  return {
    id: `c-${i}`,
    category: ['naming', 'testing', 'imports'][i % 3] ?? 'other',
    rule: `Rule number ${i}: always follow the documented convention in this module.`,
    evidence_path: `src/mod-${i % 9}/file.ts`,
    evidence_line_start: 5 + i,
    evidence_line_end: 9 + i,
    evidence_snippet: `const x${i} = 1;\nexport { x${i} };`,
    evidence_url: `https://github.com/acme/api/blob/abc123/src/mod-${i % 9}/file.ts#L${5 + i}`,
    status: 'accepted',
    ...over,
  };
}
