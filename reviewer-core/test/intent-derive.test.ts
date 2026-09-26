import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { deriveIntent, type IntentPromptInput } from '../src/index.js';

const input: IntentPromptInput = {
  title: 't',
  description: 'desc',
  files: [],
  hunkHeaders: [],
  sources: [],
  unavailable: [],
};

function fakeLlm(data: unknown, opts: { fail?: boolean } = {}) {
  const requests: StructuredRequest<unknown>[] = [];
  const llm = {
    id: 'openrouter',
    async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      requests.push(req as StructuredRequest<unknown>);
      if (opts.fail) throw new Error('provider down');
      return { data: data as T, model: req.model, tokensIn: 1402, tokensOut: 188, costUsd: 0.0003, raw: '{}', attempts: 2 };
    },
  } as unknown as LLMProvider;
  return { llm, requests };
}

describe('deriveIntent', () => {
  it('sends requireParameters + schemaName Intent, propagates usage and attempts', async () => {
    const { llm, requests } = fakeLlm({ intent: 'Add limiter', in_scope: ['a'], out_of_scope: [] });
    const r = await deriveIntent({ llm, model: 'm', input, sessionId: 's1' });
    const req = requests[0]!;
    expect(req.requireParameters).toBe(true);
    expect(req.schemaName).toBe('Intent');
    expect(req.temperature).toBe(0);
    expect(req.maxRetries).toBe(2);
    expect(req.sessionId).toBe('s1');
    expect(r.usage).toEqual({ tokensIn: 1402, tokensOut: 188, costUsd: 0.0003 });
    expect(r.attempts).toBe(2);
    expect(r.components.length).toBeGreaterThan(0);
    expect(r.intent.risk_areas).toEqual([]);
  });

  it('caps lists at 8 items / 160 chars and drops blanks', async () => {
    const many = Array.from({ length: 12 }, (_, i) => `item ${i} ${'x'.repeat(300)}`);
    const { llm } = fakeLlm({ intent: 'S', in_scope: [...many, '  '], out_of_scope: many, risk_areas: many });
    const { intent } = await deriveIntent({ llm, model: 'm', input });
    for (const list of [intent.in_scope, intent.out_of_scope, intent.risk_areas ?? []]) {
      expect(list).toHaveLength(8);
      expect(list.every((s) => s.length <= 160)).toBe(true);
    }
  });

  it('propagates provider errors', async () => {
    const { llm } = fakeLlm({}, { fail: true });
    await expect(deriveIntent({ llm, model: 'm', input })).rejects.toThrow('provider down');
  });
});
