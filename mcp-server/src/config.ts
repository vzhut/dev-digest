// Env → typed config. The API URL is loopback-only: DevDigest is a local tool and the
// MCP process must never be pointed at (or leak review data to) a remote host.

export const DEFAULT_API_URL = 'http://localhost:3001';
export const DEFAULT_RUN_LIMIT = 5;
export const RUN_WINDOW_MS = 10 * 60 * 1000;
export const POLL_MS = 3000;

// `URL.hostname` keeps the brackets of an IPv6 literal.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface Config {
  /** API base URL without a trailing slash. */
  apiUrl: string;
  /** Max paid runs started by this process per `runWindowMs`. */
  runLimit: number;
  runWindowMs: number;
  pollMs: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function parseApiUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`DEVDIGEST_API_URL is not a valid URL: '${raw}'.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`DEVDIGEST_API_URL must be http(s), got '${url.protocol}'.`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new ConfigError(
      `DEVDIGEST_API_URL host '${url.hostname}' is not allowed: only loopback (localhost, 127.0.0.1, ::1) is supported.`,
    );
  }
  return url.origin;
}

function parseRunLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_RUN_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new ConfigError(`DEVDIGEST_MCP_RUN_LIMIT must be an integer between 1 and 100, got '${raw}'.`);
  }
  return n;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const rawUrl = env.DEVDIGEST_API_URL?.trim();
  return {
    apiUrl: parseApiUrl(rawUrl ? rawUrl : DEFAULT_API_URL),
    runLimit: parseRunLimit(env.DEVDIGEST_MCP_RUN_LIMIT),
    runWindowMs: RUN_WINDOW_MS,
    pollMs: POLL_MS,
  };
}
