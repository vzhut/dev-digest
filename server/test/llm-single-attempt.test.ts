import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { OpenAIProvider } from '../src/adapters/llm/openai.js';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';

// Hermetic: every provider gets an injected fetch, so no real key or network is ever used.
const Out = z.object({ ok: z.boolean() });
const req = {
  model: 'gpt-4o-mini',
  schema: Out,
  schemaName: 'Out',
  messages: [{ role: 'user' as const, content: 'hi' }],
  singleAttempt: true,
  timeoutMs: 5_000,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function counting(respond: () => Response) {
  let calls = 0;
  const f = (async () => {
    calls++;
    return respond();
  }) as unknown as typeof fetch;
  return { fetch: f, calls: () => calls };
}

const openaiBad = () =>
  json(200, {
    id: 'x', object: 'chat.completion', created: 0, model: 'm',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"ok":"nope"}' } }],
    usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
  });
const anthropicBad = () =>
  json(200, {
    id: 'x', type: 'message', role: 'assistant', model: 'm', stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 't', name: 'Out', input: { ok: 'nope' } }],
    usage: { input_tokens: 11, output_tokens: 4 },
  });

const providers = [
  { name: 'openai', make: (fetch: typeof globalThis.fetch) => new OpenAIProvider('k', { fetch }), bad: openaiBad },
  { name: 'anthropic', make: (fetch: typeof globalThis.fetch) => new AnthropicProvider('k', { fetch }), bad: anthropicBad },
];

describe.each(providers)('$name singleAttempt', ({ make, bad }) => {
  for (const status of [500, 429]) {
    it(`makes exactly one request on HTTP ${status}`, async () => {
      const c = counting(() => json(status, { error: { message: 'boom', type: 'x' } }));
      await expect(make(c.fetch).completeStructured(req)).rejects.toBeDefined();
      expect(c.calls()).toBe(1);
    });
  }

  it('schema-invalid 200: one request, no re-prompt, error carries usage', async () => {
    const c = counting(bad);
    const err = (await make(c.fetch)
      .completeStructured(req)
      .catch((e: unknown) => e)) as { usage?: { tokensIn: number; tokensOut: number } };
    expect(c.calls()).toBe(1);
    expect(err.usage?.tokensIn).toBe(11);
    expect(err.usage?.tokensOut).toBe(4);
  });

  it('flag off still re-prompts on schema failure (unchanged behaviour)', async () => {
    const c = counting(bad);
    await expect(
      make(c.fetch).completeStructured({ ...req, singleAttempt: false, maxRetries: 1 }),
    ).rejects.toBeDefined();
    expect(c.calls()).toBe(2);
  });
});
