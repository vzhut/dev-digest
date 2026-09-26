// Sliding-window limiter for paid runs started by this process. Pure: the clock is injected,
// so tests never wait. The API has its own limit (10/min); this one is the cheaper local guard.

export interface RateLimiter {
  /** Records one use when allowed; otherwise says how long until a slot frees up. */
  tryAcquire(): { ok: true } | { ok: false; retryAfterSec: number };
}

export function createRateLimiter(opts: { limit: number; windowMs: number; now(): number }): RateLimiter {
  const stamps: number[] = [];
  return {
    tryAcquire() {
      const t = opts.now();
      while (stamps.length > 0 && t - (stamps[0] as number) >= opts.windowMs) stamps.shift();
      if (stamps.length >= opts.limit) {
        const oldest = stamps[0] as number;
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + opts.windowMs - t) / 1000)) };
      }
      stamps.push(t);
      return { ok: true };
    },
  };
}
