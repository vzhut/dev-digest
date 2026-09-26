// stdio entry. No entrypoint guard (import.meta.url vs argv[1] breaks on paths with a space).
// Nothing here touches the network: the API is only called when a tool runs.
// stdout is the protocol channel; every log goes through log.ts (stderr).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createApiClient } from './api/client.js';
import { ConfigError, loadConfig } from './config.js';
import type { ToolDeps } from './deps.js';
import { createLogger } from './log.js';
import { createResolvers } from './resolve.js';
import { createRunGuard } from './run-guard.js';
import { createMcpServer } from './server.js';

/** Sleep that settles promptly on abort (rejects, so the caller stops waiting). */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const log = createLogger();

let config;
try {
  config = loadConfig();
} catch (err) {
  process.stderr.write(`[devdigest-mcp] ${err instanceof ConfigError ? err.message : String(err)}\n`);
  process.exit(1);
}

const api = createApiClient({ baseUrl: config.apiUrl });
const now = (): number => Date.now();
const deps: ToolDeps = {
  api,
  resolvers: createResolvers({ api }),
  config,
  log,
  runGuard: createRunGuard({ limit: config.runLimit, windowMs: config.runWindowMs, now }),
  now,
  sleep: abortableSleep,
};

const server = createMcpServer(deps);
const shutdown = (): void => process.exit(0);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdin.on('end', shutdown);
process.stdin.on('close', shutdown);

await server.connect(new StdioServerTransport());
log.info(`ready (api ${config.apiUrl})`);
