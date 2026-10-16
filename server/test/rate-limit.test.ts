import { describe, expect, it } from 'vitest';
import { hit, limitFor } from '../src/modules/rate-limit/index.js';

function memoryStore() {
  const counts = new Map<string, number>();
  return {
    async incr(key: string) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    async expire() {},
  };
}

describe('rate-limit', () => {
  it('counts hits per key', async () => {
    const store = memoryStore();
    expect(await hit(store, 'a')).toBe(1);
    expect(await hit(store, 'a')).toBe(2);
  });

  it('gives admins a higher limit', () => {
    expect(limitFor('admin')).toBeGreaterThan(limitFor('user'));
  });
});
