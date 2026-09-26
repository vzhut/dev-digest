import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api/client.js';
import { FIELD_DESCRIPTIONS } from '../src/contracts.js';
import { testRunGuard } from './helpers/run-guard.js';
import type { ToolDeps } from '../src/deps.js';
import { createMcpServer } from '../src/server.js';

// Verbatim, user-approved strings (specs/devdigest-mcp.md "Tool descriptions (verbatim)").
const INSTRUCTIONS =
  'DevDigest local PR reviewer. Start with list_agents; run_agent_on_pr runs a paid review and waits up to 2 min; get_findings reads a finished run. Args: repo=owner/name, pr=number, agent=name.';
const DESCRIPTIONS: Record<string, string> = {
  list_agents:
    'List enabled review agents (name, id, model, one-line purpose). Call first: run_agent_on_pr needs an agent name or id from here.',
  run_agent_on_pr:
    'Run one review agent on a PR and wait up to 2 min; returns verdict, blockers and findings. Paid LLM call. If still running, returns run_id: fetch it later with get_findings.',
  get_findings:
    'Read findings of a finished review of a PR: verdict, blockers, score, findings by severity. Free, no LLM. Defaults to the latest run; filter by agent or run_id.',
  get_conventions:
    "Get the repo's accepted coding conventions (rule + evidence location), extracted earlier. Use to match repo style before reviewing or writing code.",
  get_blast_radius:
    "Impact map of a PR: changed symbols and their dependents. NOT IMPLEMENTED yet: always returns an error, never 'zero impact'.",
};
const FIELDS: Record<string, string> = {
  repo: 'owner/name, e.g. acme/api',
  pr: 'PR number on GitHub',
  agent: 'Agent name or id from list_agents',
  wait_seconds: 'Max seconds to wait, 30-120 (default 120)',
  run_id: 'Run id returned by run_agent_on_pr',
  severity_min: 'CRITICAL, WARNING or SUGGESTION (default)',
  limit: 'Max items to return',
  response_format: 'concise (default) or detailed',
  status: 'accepted (default), pending or all',
};

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((c) => c()));
});

async function connect() {
  // Any API call is a test failure: listing tools and rejecting bad args need no network.
  const apiCalls = vi.fn();
  const api = new Proxy({}, { get: () => apiCalls }) as unknown as ApiClient;
  const deps = {
    api,
    resolvers: { resolveRepo: apiCalls, resolvePr: apiCalls, resolveAgent: apiCalls },
    config: { apiUrl: 'http://localhost:3001', runLimit: 5, runWindowMs: 600_000, pollMs: 3000 },
    log: { info() {}, warn() {}, error() {} },
    runGuard: testRunGuard(),
    now: () => Date.now(),
    sleep: async () => {},
  } as unknown as ToolDeps;
  const server = createMcpServer(deps);
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  closers.push(async () => {
    await client.close();
    await server.close();
  });
  return { client, apiCalls };
}

describe('tools/list (in-memory MCP client)', () => {
  it('exposes exactly the five tools with flat scalar schemas and verbatim text', async () => {
    const { client } = await connect();
    const listed = await client.listTools();
    expect(listed.tools.map((t) => t.name)).toEqual([
      'list_agents',
      'run_agent_on_pr',
      'get_findings',
      'get_conventions',
      'get_blast_radius',
    ]);

    for (const tool of listed.tools) {
      expect(tool.description).toBe(DESCRIPTIONS[tool.name]);
      expect(tool.description?.length).toBeLessThanOrEqual(200);
      expect(tool.outputSchema).toBeUndefined();
      expect(tool.title).toBeTruthy();
      const props = (tool.inputSchema.properties ?? {}) as Record<string, { type?: string; description?: string }>;
      for (const [name, prop] of Object.entries(props)) {
        expect(['string', 'integer', 'number'], `${tool.name}.${name}`).toContain(prop.type);
        expect(prop.description, `${tool.name}.${name}`).toBe(FIELDS[name]);
        expect(prop.description?.length).toBeLessThanOrEqual(60);
      }
    }
    // The contracts.ts constants are the same strings as the spec table.
    expect(FIELD_DESCRIPTIONS).toEqual(FIELDS);

    const size = JSON.stringify(listed).length;
    process.stderr.write(`[tools-list.test] tools/list serialized size: ${size} chars\n`);
    expect(size).toBeLessThanOrEqual(6_000);
  });

  it('has the approved instructions and the annotations from the spec', async () => {
    const { client } = await connect();
    const instructions = client.getInstructions();
    expect(instructions).toBe(INSTRUCTIONS);
    expect(instructions?.length).toBeLessThanOrEqual(300);
    expect(client.getServerVersion()?.name).toBe('devdigest');

    const byName = new Map((await client.listTools()).tools.map((t) => [t.name, t.annotations]));
    for (const name of ['list_agents', 'get_findings', 'get_conventions', 'get_blast_radius']) {
      expect(byName.get(name)).toMatchObject({ readOnlyHint: true, idempotentHint: true, openWorldHint: false });
    }
    expect(byName.get('run_agent_on_pr')).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it('rejects invalid arguments (pr:-1) before any API call', async () => {
    const { client, apiCalls } = await connect();
    const res = await client.callTool({ name: 'get_findings', arguments: { repo: 'acme/api', pr: -1 } });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toMatch(/pr/i);
    expect(apiCalls).not.toHaveBeenCalled();
  });
});
