// Shared state of run_agent_on_pr, created ONCE in the composition root (index.ts) and carried
// in ToolDeps, so copying/spreading deps can never reset it.
import type { ToolResult } from './format/errors.js';
import { createRateLimiter, type RateLimiter } from './rate-limit.js';

export interface RunGuard {
  /** Local cap on paid runs started by this process (`config.runLimit` per `runWindowMs`). */
  limiter: RateLimiter;
  /** `prId:agentId` → the call currently starting/waiting for that run (identical calls share it). */
  inFlight: Map<string, Promise<ToolResult>>;
}

export function createRunGuard(opts: { limit: number; windowMs: number; now(): number }): RunGuard {
  return { limiter: createRateLimiter(opts), inFlight: new Map() };
}
