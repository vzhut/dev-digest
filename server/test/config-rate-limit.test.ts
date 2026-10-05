import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

const cfg = (env: Record<string, string>) => loadConfig({ ...env } as NodeJS.ProcessEnv);

describe('RATE_LIMIT_MAX (global API rate limit)', () => {
  it('defaults to 120 requests per minute', () => {
    expect(cfg({ NODE_ENV: 'development' }).rateLimitMax).toBe(120);
  });

  it('can be raised for the e2e stack', () => {
    expect(cfg({ NODE_ENV: 'development', RATE_LIMIT_MAX: '100000' }).rateLimitMax).toBe(100000);
  });

  it('rejects zero and non-numeric values instead of disabling the limit by accident', () => {
    expect(() => cfg({ NODE_ENV: 'development', RATE_LIMIT_MAX: '0' })).toThrow();
    expect(() => cfg({ NODE_ENV: 'development', RATE_LIMIT_MAX: 'lots' })).toThrow();
  });
});
