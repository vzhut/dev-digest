import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

const cfg = (env: Record<string, string>) => loadConfig({ ...env } as NodeJS.ProcessEnv);

describe('PROMPT_LOG_VERBOSE gating (local development only)', () => {
  it('is off by default', () => {
    expect(cfg({ NODE_ENV: 'development' })).toMatchObject({ promptLogVerbose: false, promptLogVerboseIgnored: false });
  });

  it('is honoured only when NODE_ENV=development', () => {
    expect(cfg({ NODE_ENV: 'development', PROMPT_LOG_VERBOSE: 'true' })).toMatchObject({
      promptLogVerbose: true,
      promptLogVerboseIgnored: false,
    });
  });

  it('is ignored, and flagged for a startup warning, in production and test', () => {
    for (const NODE_ENV of ['production', 'test']) {
      expect(cfg({ NODE_ENV, PROMPT_LOG_VERBOSE: 'true' })).toMatchObject({
        promptLogVerbose: false,
        promptLogVerboseIgnored: true,
      });
    }
  });

  it('only the exact string "true" turns it on', () => {
    for (const v of ['1', 'yes', 'TRUE', 'false', '']) {
      expect(cfg({ NODE_ENV: 'development', PROMPT_LOG_VERBOSE: v }).promptLogVerbose).toBe(false);
    }
  });
});
