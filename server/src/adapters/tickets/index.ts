/**
 * Port for Jira/Linear lookups (intent layer). The caller passes `{host, key}`
 * parsed from a PR link — never the raw URL; the adapter builds the request URL
 * itself and only for allowlisted hosts. Fetched text is untrusted.
 */
export type TicketResult = { title: string; body: string } | { error: 'blocked' | 'missing'; reason: string };

export interface TicketFetcher {
  fetch(ref: { host: string; key: string }): Promise<TicketResult>;
}

export { HttpTicketFetcher, type HttpTicketFetcherDeps } from './http.js';
export { isPrivateAddress } from './ip.js';
