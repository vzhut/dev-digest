import { createRunGuard, type RunGuard } from '../../src/run-guard.js';

/** A fresh guard for tests that build ToolDeps by hand (5 runs / 10 min unless overridden). */
export function testRunGuard(now: () => number = () => 0, o: { limit?: number | undefined; windowMs?: number | undefined } = {}): RunGuard {
  return createRunGuard({ limit: o.limit ?? 5, windowMs: o.windowMs ?? 600_000, now });
}
