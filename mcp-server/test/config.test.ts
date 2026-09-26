import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('defaults to the local API and 5 runs per 10 minutes', () => {
    const c = loadConfig({});
    expect(c).toEqual({ apiUrl: 'http://localhost:3001', runLimit: 5, runWindowMs: 600_000, pollMs: 3000 });
  });

  it('accepts loopback hosts and strips a trailing slash', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://127.0.0.1:3001' }).apiUrl).toBe('http://127.0.0.1:3001');
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://[::1]:3001/' }).apiUrl).toBe('http://[::1]:3001');
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://localhost:3101/' }).apiUrl).toBe('http://localhost:3101');
  });

  it('rejects non-loopback hosts, look-alikes, bad URLs and non-http schemes', () => {
    for (const bad of [
      'http://evil.example:3001',
      'http://localhost.evil.example:3001',
      'http://127.0.0.1.evil.example',
      'http://0.0.0.0:3001',
      'ftp://localhost',
      'not a url',
    ]) {
      expect(() => loadConfig({ DEVDIGEST_API_URL: bad }), bad).toThrow(ConfigError);
    }
  });

  it('reads and validates the run limit', () => {
    expect(loadConfig({ DEVDIGEST_MCP_RUN_LIMIT: '2' }).runLimit).toBe(2);
    expect(() => loadConfig({ DEVDIGEST_MCP_RUN_LIMIT: '0' })).toThrow(ConfigError);
    expect(() => loadConfig({ DEVDIGEST_MCP_RUN_LIMIT: 'abc' })).toThrow(ConfigError);
  });
});
