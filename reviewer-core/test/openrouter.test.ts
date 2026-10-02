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

describe('OpenRouterProvider — singleAttempt', () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  // Provider built with the DEFAULT maxRetries (2): only the per-request option can stop SDK retries.
  function build(respond: () => Response) {
    let calls = 0;
    const f = (async () => {
      calls++;
      return respond();
    }) as unknown as typeof fetch;
    return { provider: new OpenRouterProvider('k', { fetch: f }), calls: () => calls };
  }

  for (const status of [500, 429]) {
    it(`makes exactly one request on HTTP ${status}`, async () => {
      const { provider, calls } = build(() => json(status, { error: { message: 'boom' } }));
      await expect(provider.completeStructured({ ...req, singleAttempt: true })).rejects.toBeDefined();
      expect(calls()).toBe(1);
    });
  }

  it('flag off keeps the SDK retry (more than one request on 500)', async () => {
    const { provider, calls } = build(() => json(500, { error: { message: 'boom' } }));
    await expect(provider.completeStructured({ ...req, timeoutMs: 5_000 })).rejects.toBeDefined();
    expect(calls()).toBeGreaterThan(1);
  }, 20_000);

  it('schema-invalid 200: one request, no re-prompt, error carries usage', async () => {
    const { provider, calls } = build(() =>
      json(200, {
        id: 'x', object: 'chat.completion', created: 0, model: 'm',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"ok":"nope"}' } }],
        usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10, cost: 0.002 },
      }),
    );
    const err = (await provider
      .completeStructured({ ...req, singleAttempt: true })
      .catch((e: unknown) => e)) as Error & { usage?: { tokensIn: number; tokensOut: number; costUsd: number | null } };
    expect(calls()).toBe(1);
    expect(err.usage).toEqual({ tokensIn: 7, tokensOut: 3, costUsd: 0.002 });
  });
});
