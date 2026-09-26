import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api/client.js';
import { testRunGuard } from './helpers/run-guard.js';
import type { ToolContext, ToolDeps } from '../src/deps.js';
import { createResolvers } from '../src/resolve.js';
import { getBlastRadius } from '../src/tools/get-blast-radius.js';
import { getConventions } from '../src/tools/get-conventions.js';
import { getFindings } from '../src/tools/get-findings.js';
import { listAgents } from '../src/tools/list-agents.js';
import { runAgentOnPr } from '../src/tools/run-agent-on-pr.js';
import { makeCandidate, makeFindings, makeReview, makeRun } from './fixtures/reviews.js';

// Default (concise) response of every tool on large data stays within ~2.5K tokens.
const MAX_CHARS = 10_000;

const AGENTS = Array.from({ length: 40 }, (_, i) => ({
  id: `agent-${i}`,
  name: `Agent ${String(i).padStart(2, '0')}`,
  description: 'A very descriptive purpose line. '.repeat(20),
  provider: 'openrouter',
  model: 'some-model',
  enabled: true,
  system_prompt: 'SECRET PROMPT',
}));

function setup() {
  const review = makeReview({ agent_id: 'agent-0', run_id: 'run-1', findings: makeFindings(143) });
  const api = {
    listRepos: vi.fn(async () => [{ id: 'repo-1', full_name: 'acme/api' }]),
    listPulls: vi.fn(async () => [{ id: 'pr-uuid-12', number: 12, title: 'Fix', status: 'needs_review' }]),
    listAgents: vi.fn(async () => AGENTS),
    getPull: vi.fn(async () => {}),
    activeRuns: vi.fn(async () => []),
    startReview: vi.fn(async () => ({ runs: [{ run_id: 'run-1', agent_id: 'agent-0', agent_name: 'Agent 00' }] })),
    listRuns: vi.fn(async () => [makeRun({ agent_id: 'agent-0', agent_name: 'Agent 00' })]),
    listReviews: vi.fn(async () => [review]),
    getConventions: vi.fn(async () => ({
      scan: { sha: 'abc123' },
      candidates: Array.from({ length: 120 }, (_, i) => makeCandidate(i)),
    })),
  } as unknown as ApiClient;
  const deps: ToolDeps = {
    api,
    resolvers: createResolvers({ api }),
    config: { apiUrl: 'http://localhost:3001', runLimit: 5, runWindowMs: 600_000, pollMs: 3000 },
    log: { info() {}, warn() {}, error() {} },
    runGuard: testRunGuard(),
    now: () => 0,
    sleep: async () => {},
  };
  const ctx: ToolContext = { progress: async () => {} };
  return { deps, ctx };
}

const text = (r: { content: { text: string }[] }) => r.content[0]?.text ?? '';

describe('default response size on large fixtures', () => {
  it('each tool stays under 10,000 chars', async () => {
    const { deps, ctx } = setup();
    const sizes: Record<string, number> = {};

    const agents = await listAgents(deps, {}, ctx);
    sizes.list_agents = text(agents).length;
    expect(text(agents)).not.toContain('SECRET PROMPT');

    const run = await runAgentOnPr(deps, { repo: 'acme/api', pr: 12, agent: 'Agent 00', wait_seconds: 120 }, ctx);
    sizes.run_agent_on_pr = text(run).length;
    expect(JSON.parse(text(run))).toMatchObject({ status: 'done', total: 143 });

    const findings = await getFindings(
      deps,
      { repo: 'acme/api', pr: 12, severity_min: 'SUGGESTION', limit: 20, response_format: 'concise' },
      ctx,
    );
    sizes.get_findings = text(findings).length;
    expect(JSON.parse(text(findings))).toMatchObject({ shown: 20, total: 143 });

    const conventions = await getConventions(
      deps,
      { repo: 'acme/api', status: 'accepted', limit: 30, response_format: 'concise' },
      ctx,
    );
    sizes.get_conventions = text(conventions).length;
    expect(JSON.parse(text(conventions))).toMatchObject({ shown: 30, total: 120 });

    const blast = await getBlastRadius(deps, { repo: 'acme/api', pr: 12, limit: 20 }, ctx);
    sizes.get_blast_radius = text(blast).length;

    process.stderr.write(`[response-size.test] chars per tool: ${JSON.stringify(sizes)}\n`);
    for (const [tool, size] of Object.entries(sizes)) expect(size, tool).toBeLessThanOrEqual(MAX_CHARS);
  });
});
