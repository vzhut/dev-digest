import type { ApiClient } from './api/client.js';
import type { Config } from './config.js';
import type { Logger } from './log.js';
import type { Resolvers } from './resolve.js';
import type { RunGuard } from './run-guard.js';

/** Everything a tool handler may touch. Tests pass fakes; no module mocking. */
export interface ToolDeps {
  api: ApiClient;
  resolvers: Resolvers;
  config: Config;
  log: Logger;
  /** Rate limiter + in-flight map of run_agent_on_pr; created once in the composition root. */
  runGuard: RunGuard;
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/** Per-call context supplied by the MCP registry (T8). */
export interface ToolContext {
  signal?: AbortSignal;
  /** Sends notifications/progress; a no-op when the client sent no progressToken. */
  progress(p: { progress: number; total?: number; message?: string }): Promise<void>;
}
