import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/api/client.js';
import { ApiError, ApiNotFoundError, ApiRateLimitError, ApiUnreachableError } from '../src/api/errors.js';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function client(impl: (url: string, init: RequestInit) => Promise<Response>, timeoutMs = 15_000) {
  const fetchMock = vi.fn(impl);
  return { api: createApiClient({ baseUrl: 'http://localhost:3001/', fetch: fetchMock as unknown as typeof fetch, timeoutMs }), fetchMock };
}

describe('api client', () => {
  it('parses consumed fields only: system_prompt / output_schema never enter the process', async () => {
    const { api, fetchMock } = client(async () =>
      json([{ id: 'a1', name: 'General', description: 'd', provider: 'openrouter', model: 'm', enabled: true, system_prompt: 'SECRET PROMPT', output_schema: { x: 1 }, version: 3 }]),
    );
    const agents = await api.listAgents();
    expect(JSON.stringify(agents)).not.toContain('SECRET');
    expect(agents[0]).not.toHaveProperty('system_prompt');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3001/agents');
  });

  it('connection refused → unreachable message with ./scripts/dev.sh', async () => {
    const { api } = client(async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    });
    const err = await api.listRepos().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiUnreachableError);
    expect((err as Error).message).toContain('./scripts/dev.sh');
    expect((err as Error).message).toContain('http://localhost:3001');
  });

  it('maps 404 and 429, and never echoes error details', async () => {
    const notFound = client(async () => json({ error: { code: 'not_found', message: 'Pull request not found' } }, 404));
    await expect(notFound.api.getPull('p')).rejects.toBeInstanceOf(ApiNotFoundError);

    const limited = client(async () => json({ error: { code: 'rate_limited', message: 'slow down' } }, 429, { 'retry-after': '42' }));
    const rl = await limited.api.startReview('p', 'a').catch((e: unknown) => e);
    expect(rl).toBeInstanceOf(ApiRateLimitError);
    expect((rl as Error).message).toContain('42');

    const other = client(async () => json({ error: { code: 'validation_error', message: 'bad \u001b[31minput', details: { secret: 'x-leaked-value' } } }, 422));
    const err = (await other.api.listRuns('p').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('validation_error');
    expect(err.message).toContain('bad input');
    expect(err.message).not.toContain('x-leaked-value');
    expect(err.message).not.toContain('secret');
  });

  it('surfaces the unseeded-database message', async () => {
    const { api } = client(async () => json({ error: { code: 'internal_error', message: 'No system user found — run `pnpm db:seed`.' } }, 500));
    await expect(api.listAgents()).rejects.toThrow('pnpm db:seed');
  });

  it('non-JSON error body and unexpected shapes fail loudly, without values', async () => {
    const html = client(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(html.api.listAgents()).rejects.toThrow('HTTP 502');

    const drift = client(async () => json([{ id: 'a1', name: 'x', provider: 'p', model: 'm', enabled: 'yes' }]));
    const err = (await drift.api.listAgents().catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('unexpected_shape');
    expect(err.message).toContain('GET /agents');
    expect(err.message).toContain('schemas.ts');
    expect(err.message).not.toContain('yes');
  });

  it('POSTs startReview with the agent id and parses the created runs', async () => {
    const { api, fetchMock } = client(async () => json({ pr_id: 'p', runs: [{ run_id: 'r1', agent_id: 'a1', agent_name: 'G' }], reviews: [] }));
    const res = await api.startReview('p 1', 'a1');
    expect(res.runs[0]?.run_id).toBe('r1');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://localhost:3001/pulls/p%201/review');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ agentId: 'a1' });
  });

  it('times out with a retry hint and honours a caller abort', async () => {
    const hang = (_: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(init.signal?.reason));
      });
    const slow = client(hang, 20);
    const t = (await slow.api.listRuns('p').catch((e: unknown) => e)) as ApiError;
    expect(t.code).toBe('timeout');

    const ctl = new AbortController();
    const { api } = client(hang);
    const pending = api.listRuns('p', { signal: ctl.signal }).catch((e: unknown) => e);
    ctl.abort();
    expect(((await pending) as ApiError).code).toBe('aborted');
  });

  it('gives listPulls twice the timeout budget (it syncs GitHub)', async () => {
    const delay = (_: string, init: RequestInit) =>
      new Promise<Response>((res, rej) => {
        const t = setTimeout(() => res(json([])), 60);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          rej(init.signal?.reason);
        });
      });
    const { api } = client(delay, 40);
    await expect(api.listRuns('p')).rejects.toMatchObject({ code: 'timeout' });
    await expect(api.listPulls('r')).resolves.toEqual([]);
  });
});
