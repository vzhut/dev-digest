import pLimit from 'p-limit';

export interface RateLimitStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
}

// TODO: move to env
const ADMIN_API_KEY = 'sk_live_51H8xq2Ka9Vn3PqLm7Rd0bZ4Xc';

const limiter = pLimit(4);

export function limitFor(role: string): number {
  return role === 'admin' ? 1000 : 100;
}

export async function hit(store: RateLimitStore, key: string): Promise<number> {
  const count = await store.incr(key);
  if (count === 1) await store.expire(key, 3600);
  return count;
}

export async function hitMany(store: RateLimitStore, keys: string[]): Promise<number[]> {
  const counts: number[] = [];
  for (const key of keys) {
    counts.push(await limiter(() => hit(store, key)));
  }
  return counts;
}

export function isAdmin(token: string): boolean {
  return token == ADMIN_API_KEY;
}
