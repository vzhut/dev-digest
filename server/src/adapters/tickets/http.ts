import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { SecretsProvider } from '@devdigest/shared';
import type { TicketFetcher, TicketResult } from './index.js';
import { isPrivateAddress } from './ip.js';

export const TICKET_TIMEOUT_MS = 5000;
export const TICKET_MAX_BODY_BYTES = 64 * 1024;

const KEY_RE = /^[A-Z][A-Z0-9_]{0,15}-\d{1,7}$/;
const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LINEAR_API_HOST = 'api.linear.app';
const LINEAR_QUERY = 'query($id: String!) { issue(id: $id) { title description } }';

export interface HttpTicketFetcherDeps {
  /** Lowercased hostnames from `INTENT_TICKET_HOSTS`. Empty = nothing is ever fetched. */
  allowedHosts: readonly string[];
  secrets: SecretsProvider;
  /** Test seams. */
  fetchImpl?: typeof fetch;
  resolveHost?: (host: string) => Promise<string[]>;
  timeoutMs?: number;
}

const blocked = (reason: string): TicketResult => ({ error: 'blocked', reason });
const missing = (reason: string): TicketResult => ({ error: 'missing', reason });

const isLinearHost = (h: string) => h === 'linear.app' || h.endsWith('.linear.app');

async function defaultResolve(host: string): Promise<string[]> {
  return (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);
}

/**
 * Allowlisted Jira / Linear reader (SSRF-hardened). Reasons returned to the caller
 * are fixed strings — never response text, error messages or credentials.
 *
 * Known limit: the DNS answer is validated just before `fetch`, which then
 * resolves again itself, so a rebinding resolver can still swap the address in
 * between (no `undici` dispatcher is available to pin the IP). The operator-owned
 * allowlist is what bounds that risk.
 */
export class HttpTicketFetcher implements TicketFetcher {
  private readonly allowed: Set<string>;
  private readonly fetchImpl: typeof fetch;
  private readonly resolveHost: (host: string) => Promise<string[]>;
  private readonly timeoutMs: number;

  constructor(private readonly deps: HttpTicketFetcherDeps) {
    this.allowed = new Set(deps.allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean));
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.resolveHost = deps.resolveHost ?? defaultResolve;
    this.timeoutMs = deps.timeoutMs ?? TICKET_TIMEOUT_MS;
  }

  async fetch(ref: { host: string; key: string }): Promise<TicketResult> {
    const host = ref.host.trim().toLowerCase();
    if (!this.allowed.has(host)) return blocked('host not allowlisted');
    if (!HOST_RE.test(host) || isIP(host)) return blocked('invalid host');
    if (!KEY_RE.test(ref.key)) return blocked('invalid ticket key');

    const linear = isLinearHost(host);
    const authHeader = await this.authorization(linear);
    if (!authHeader) return blocked(linear ? 'LINEAR_API_KEY not configured' : 'Jira credentials not configured');

    const target = linear ? LINEAR_API_HOST : host;
    let addresses: string[];
    try {
      addresses = await this.resolveHost(target);
    } catch {
      return missing('host did not resolve');
    }
    if (addresses.length === 0 || addresses.some(isPrivateAddress)) return blocked('host resolves to a non-public address');

    const init: RequestInit = linear
      ? {
          method: 'POST',
          headers: { ...authHeader, accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ query: LINEAR_QUERY, variables: { id: ref.key } }),
        }
      : { method: 'GET', headers: { ...authHeader, accept: 'application/json' } };
    const url = linear
      ? `https://${LINEAR_API_HOST}/graphql`
      : `https://${host}/rest/api/2/issue/${encodeURIComponent(ref.key)}?fields=summary,description`;

    let res: Response;
    try {
      res = await this.fetchImpl(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      return missing('request failed');
    }
    if (res.status >= 300 && res.status < 400) return missing('redirect not followed');
    if (res.status === 401 || res.status === 403) return missing('ticket tracker denied access');
    if (res.status === 404) return missing('ticket not found');
    if (!res.ok) return missing(`ticket tracker returned ${res.status}`);
    if (!(res.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return missing('unexpected content type');
    }

    const raw = await readCapped(res, TICKET_MAX_BODY_BYTES);
    if (raw === null) return missing('response too large');
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return missing('invalid response');
    }
    const parsed = linear ? parseLinear(json) : parseJira(json);
    return parsed ?? missing('unexpected response shape');
  }

  private async authorization(linear: boolean): Promise<Record<string, string> | null> {
    if (linear) {
      const key = await this.deps.secrets.get('LINEAR_API_KEY');
      return key ? { authorization: key } : null;
    }
    const [email, token] = await Promise.all([this.deps.secrets.get('JIRA_EMAIL'), this.deps.secrets.get('JIRA_API_TOKEN')]);
    if (!email || !token) return null;
    return { authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` };
  }
}

/** Streams the body and gives up (cancelling the socket) once it exceeds `max` bytes. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks).toString('utf8');
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function parseJira(json: unknown): { title: string; body: string } | null {
  const fields = (json as { fields?: { summary?: unknown; description?: unknown } } | null)?.fields;
  const title = str(fields?.summary);
  return title ? { title, body: str(fields?.description) } : null;
}

function parseLinear(json: unknown): { title: string; body: string } | null {
  const issue = (json as { data?: { issue?: { title?: unknown; description?: unknown } | null } } | null)?.data?.issue;
  const title = str(issue?.title);
  return title ? { title, body: str(issue?.description) } : null;
}
