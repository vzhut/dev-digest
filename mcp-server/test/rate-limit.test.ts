import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/rate-limit.js';

describe('createRateLimiter', () => {
  it('allows `limit` uses per window, then reports the wait until the oldest expires', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 3, windowMs: 600_000, now: () => t });
    for (let i = 0; i < 3; i++) {
      expect(rl.tryAcquire()).toEqual({ ok: true });
      t += 10_000;
    }
    // t = 30 s; the oldest use was at 0 → frees at 600 s.
    expect(rl.tryAcquire()).toEqual({ ok: false, retryAfterSec: 570 });
    // a rejected attempt is not recorded
    t = 600_000;
    expect(rl.tryAcquire()).toEqual({ ok: true });
  });

  it('slides: old uses drop out of the window one by one', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    rl.tryAcquire();
    t = 500;
    rl.tryAcquire();
    t = 999;
    expect(rl.tryAcquire().ok).toBe(false);
    t = 1000; // first use expired, second still counts
    expect(rl.tryAcquire().ok).toBe(true);
    expect(rl.tryAcquire().ok).toBe(false);
  });
});
