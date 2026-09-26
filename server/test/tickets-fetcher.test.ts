import { describe, it, expect, vi } from 'vitest';
import { HttpTicketFetcher, isPrivateAddress } from '../src/adapters/tickets/index.js';
import { MockSecretsProvider, MockTicketFetcher } from '../src/adapters/mocks.js';
import { loadConfig } from '../src/platform/config.js';

const TOKEN = 'tok-SECRET-123';
const secrets = new MockSecretsProvider({ JIRA_API_TOKEN: TOKEN, JIRA_EMAIL: 'me@acme.com', LINEAR_API_KEY: 'lin_api_SECRET' });
const PUBLIC = async () => ['203.0.113.10'];
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

const make = (fetchImpl: typeof fetch, over: Partial<ConstructorParameters<typeof HttpTicketFetcher>[0]> = {}) =>
  new HttpTicketFetcher({ allowedHosts: ['jira.acme.com', 'acme.linear.app'], secrets, fetchImpl, resolveHost: PUBLIC, ...over });

describe('HttpTicketFetcher', () => {
  it('does not fetch a non-allowlisted host (and an empty allowlist blocks everything)', async () => {
    const f = vi.fn();
    const res = await make(f as unknown as typeof fetch).fetch({ host: 'evil.example', key: 'ABC-1' });
    expect(res).toEqual({ error: 'blocked', reason: 'host not allowlisted' });
    const empty = await make(f as unknown as typeof fetch, { allowedHosts: [] }).fetch({ host: 'jira.acme.com', key: 'ABC-1' });
    expect(empty).toEqual({ error: 'blocked', reason: 'host not allowlisted' });
    expect(f).not.toHaveBeenCalled();
  });

  it('reads a Jira issue from a URL built from host + key, with redirect:manual and a timeout signal', async () => {
    const f = vi.fn(async () => json({ fields: { summary: 'Rate limit', description: 'Throttle /v1' } }));
    const res = await make(f as unknown as typeof fetch).fetch({ host: 'Jira.Acme.com', key: 'ABC-1' });
    expect(res).toEqual({ title: 'Rate limit', body: 'Throttle /v1' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://jira.acme.com/rest/api/2/issue/ABC-1?fields=summary,description');
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from(`me@acme.com:${TOKEN}`).toString('base64')}`);
  });

  it('reads a Linear issue through the fixed GraphQL endpoint', async () => {
    const f = vi.fn(async () => json({ data: { issue: { title: 'Fix', description: 'Body' } } }));
    const res = await make(f as unknown as typeof fetch).fetch({ host: 'acme.linear.app', key: 'ENG-7' });
    expect(res).toEqual({ title: 'Fix', body: 'Body' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.linear.app/graphql');
    expect(JSON.parse(init.body as string).variables).toEqual({ id: 'ENG-7' });
  });

  it('treats a 302 as missing and never follows it', async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }));
    const res = await make(f as unknown as typeof fetch).fetch({ host: 'jira.acme.com', key: 'ABC-1' });
    expect(res).toEqual({ error: 'missing', reason: 'redirect not followed' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('gives up on an oversize body (>64 KB) instead of buffering it', async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled += 1;
        c.enqueue(new Uint8Array(16 * 1024).fill(97));
      },
    });
    const f = vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }));
    const res = await make(f as unknown as typeof fetch).fetch({ host: 'jira.acme.com', key: 'ABC-1' });
    expect(res).toEqual({ error: 'missing', reason: 'response too large' });
    expect(pulled).toBeLessThan(10);
  });

  it('rejects a non-JSON content type', async () => {
    const f = vi.fn(async () => new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const res = await make(f as unknown as typeof fetch).fetch({ host: 'jira.acme.com', key: 'ABC-1' });
    expect(res).toEqual({ error: 'missing', reason: 'unexpected content type' });
  });

  it('blocks without any request when a token is missing, and never leaks a token in a reason', async () => {
    const f = vi.fn(async () => json({}, { status: 500 }));
    const noJira = make(f as unknown as typeof fetch, { secrets: new MockSecretsProvider({ JIRA_EMAIL: 'me@acme.com' }) });
    const noLinear = make(f as unknown as typeof fetch, { secrets: new MockSecretsProvider({}) });
    const a = await noJira.fetch({ host: 'jira.acme.com', key: 'ABC-1' });
    const b = await noLinear.fetch({ host: 'acme.linear.app', key: 'ENG-1' });
    expect(a).toMatchObject({ error: 'blocked' });
    expect(b).toMatchObject({ error: 'blocked' });
    expect(f).not.toHaveBeenCalled();

    // every failure path: reasons are fixed strings free of secrets
    const outcomes = [
      await make((async () => json({}, { status: 401 })) as typeof fetch).fetch({ host: 'jira.acme.com', key: 'ABC-1' }),
      await make((async () => { throw new Error(`boom ${TOKEN}`); }) as typeof fetch).fetch({ host: 'jira.acme.com', key: 'ABC-1' }),
      await make((async () => json('not json {')) as typeof fetch).fetch({ host: 'jira.acme.com', key: 'ABC-1' }),
    ];
    for (const o of [a, b, ...outcomes]) {
      const text = JSON.stringify(o);
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain('lin_api_SECRET');
      expect(text).not.toContain('me@acme.com');
    }
  });

  it('blocks a host that resolves to a private / loopback / metadata address before connecting', async () => {
    const f = vi.fn();
    for (const addr of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '::1', '::ffff:192.168.0.1']) {
      const res = await make(f as unknown as typeof fetch, { resolveHost: async () => [addr] }).fetch({ host: 'jira.acme.com', key: 'ABC-1' });
      expect(res).toEqual({ error: 'blocked', reason: 'host resolves to a non-public address' });
    }
    // one bad record among public ones is enough to refuse
    const mixed = await make(f as unknown as typeof fetch, { resolveHost: async () => ['203.0.113.1', '10.0.0.1'] }).fetch({ host: 'jira.acme.com', key: 'ABC-1' });
    expect(mixed).toMatchObject({ error: 'blocked' });
    expect(f).not.toHaveBeenCalled();
  });

  it('rejects malformed keys and hosts', async () => {
    const f = vi.fn();
    const fx = make(f as unknown as typeof fetch, { allowedHosts: ['jira.acme.com', '10.0.0.1'] });
    expect(await fx.fetch({ host: 'jira.acme.com', key: '../../x' })).toMatchObject({ error: 'blocked' });
    expect(await fx.fetch({ host: '10.0.0.1', key: 'ABC-1' })).toMatchObject({ error: 'blocked' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('isPrivateAddress', () => {
  it('classifies addresses', () => {
    for (const a of ['0.0.0.0', '127.0.0.1', '10.0.0.1', '172.16.5.5', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', 'fe80::1', 'fd00::1', '::', 'not-an-ip'])
      expect(isPrivateAddress(a), a).toBe(true);
    for (const a of ['8.8.8.8', '172.32.0.1', '203.0.113.10', '2606:4700::1111', '2001:4860:4860::8888'])
      expect(isPrivateAddress(a), a).toBe(false);
  });

  it('treats IPv4-compatible, 6to4, Teredo and documentation IPv6 as non-public', () => {
    // ::7f00:1 is the deprecated IPv4-compatible form of 127.0.0.1; 6to4 embeds a v4 address
    for (const a of ['::7f00:1', '::1.2.3.4', '2002:7f00:1::1', '2001:db8::1', '2001:0db8::1', '2001:0:4136:e378::1', '2001::1'])
      expect(isPrivateAddress(a), a).toBe(true);
  });
});

describe('config + mock', () => {
  it('INTENT_TICKET_HOSTS defaults to empty and parses a lowercased list', () => {
    expect(loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).intentTicketHosts).toEqual([]);
    expect(loadConfig({ NODE_ENV: 'test', INTENT_TICKET_HOSTS: ' Jira.Acme.com, ,acme.linear.app' } as NodeJS.ProcessEnv).intentTicketHosts).toEqual(['jira.acme.com', 'acme.linear.app']);
  });

  it('MockTicketFetcher returns canned tickets and records calls', async () => {
    const m = new MockTicketFetcher({ 'jira.acme.com/ABC-1': { title: 'T', body: 'B' } });
    expect(await m.fetch({ host: 'jira.acme.com', key: 'ABC-1' })).toEqual({ title: 'T', body: 'B' });
    expect(await m.fetch({ host: 'x.com', key: 'ABC-2' })).toMatchObject({ error: 'missing' });
    expect(m.calls).toHaveLength(2);
  });
});
