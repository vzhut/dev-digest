import { describe, expect, it, vi } from 'vitest';
import { ApiUnreachableError } from '../src/api/errors.js';
import type { ApiClient } from '../src/api/client.js';
import type { Agent } from '../src/api/schemas.js';
import type { ToolContext, ToolDeps } from '../src/deps.js';
import { listAgents } from '../src/tools/list-agents.js';

const ctx: ToolContext = { progress: async () => {} };
const agent = (over: Partial<Agent>): Agent => ({ id: 'a', name: 'A', provider: 'openrouter', model: 'm', enabled: true, description: '', ...over });

function depsWith(listAgentsImpl: () => Promise<unknown>): ToolDeps {
  return { api: { listAgents: vi.fn(listAgentsImpl) } as unknown as ApiClient } as unknown as ToolDeps;
}
const text = (r: { content: { text: string }[] }) => r.content[0]?.text ?? '';

describe('list_agents', () => {
  it('returns enabled agents only, sorted by name, without prompt fields', async () => {
    const raw = [
      // Extra wire fields must never survive, even if a parser let them through.
      { ...agent({ id: 'z', name: 'Zeta', model: 'gpt', description: 'Last one' }), system_prompt: 'SECRET PROMPT TEXT', output_schema: { leak: 'SCHEMA-LEAK' } },
      agent({ id: 'off', name: 'Disabled one', enabled: false }),
      agent({ id: 'a', name: 'alpha', provider: 'anthropic', model: 'claude', description: 'x'.repeat(300) + '\u001b[31m' }),
    ];
    const r = await listAgents(depsWith(async () => raw), {}, ctx);
    const out = text(r);
    const body = JSON.parse(out) as { agents: { name: string; id: string; model: string; about?: string }[] };
    expect(r.isError).toBeUndefined();
    expect(body.agents.map((a) => a.name)).toEqual(['alpha', 'Zeta']);
    expect(body.agents[0]).toMatchObject({ id: 'a', model: 'anthropic/claude' });
    expect(body.agents[0]?.about?.length).toBeLessThanOrEqual(120);
    expect(body.agents[1]?.about).toBe('Last one');
    expect(out).not.toContain('SECRET PROMPT TEXT');
    expect(out).not.toContain('SCHEMA-LEAK');
    expect(out).not.toMatch(/system_prompt|output_schema|Disabled one|\u001b/);
    expect(out).not.toContain('null');
  });

  it('no enabled agents → empty list with a hint (not an error)', async () => {
    const r = await listAgents(depsWith(async () => [agent({ enabled: false })]), {}, ctx);
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(text(r))).toEqual({ agents: [], hint: expect.stringContaining('DevDigest → Agents') });
  });

  it('API unreachable → isError with the start command', async () => {
    const r = await listAgents(depsWith(async () => { throw new ApiUnreachableError('http://localhost:3001'); }), {}, ctx);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('./scripts/dev.sh');
  });

  it('unexpected errors are rethrown for the registry', async () => {
    await expect(listAgents(depsWith(async () => { throw new TypeError('boom'); }), {}, ctx)).rejects.toThrow('boom');
  });
});
