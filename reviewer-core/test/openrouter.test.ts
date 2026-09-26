import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/index.js';

const Out = z.object({ ok: z.boolean() });

function capture(id?: 'openai' | 'openrouter') {
  const bodies: Record<string, unknown>[] = [];
  const stubFetch = (async (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        id: 'x',
        object: 'chat.completion',
        created: 0,
        model: 'm',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"ok":true}' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  const provider = new OpenRouterProvider('k', { fetch: stubFetch, maxRetries: 0, ...(id ? { id } : {}) });
  return { provider, bodies };
}

const req = { model: 'm', schema: Out, schemaName: 'Out', messages: [{ role: 'user' as const, content: 'hi' }] };

describe('OpenRouterProvider — provider.require_parameters', () => {
  it('sends provider.require_parameters only when requested', async () => {
    const { provider, bodies } = capture();
    await provider.completeStructured({ ...req, requireParameters: true });
    expect(bodies[0]!.provider).toEqual({ require_parameters: true });
  });

  it('leaves the request unchanged (no provider key) when not requested', async () => {
    const { provider, bodies } = capture();
    await provider.completeStructured(req);
    expect('provider' in bodies[0]!).toBe(false);
  });

  it('never sends it to a non-OpenRouter endpoint', async () => {
    const { provider, bodies } = capture('openai');
    await provider.completeStructured({ ...req, requireParameters: true });
    expect('provider' in bodies[0]!).toBe(false);
  });
});
