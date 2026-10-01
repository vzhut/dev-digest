import { describe, it, expect } from 'vitest';
import { isJunkPath } from '../src/modules/repo-intel/junk-paths.js';

describe('isJunkPath', () => {
  it('matches junk at any depth including the repo root, case-insensitively', () => {
    for (const p of ['test/x.ts', 'src/a.test.ts', 'types/x.d.ts', 'db/migrations/0001.sql', 'vitest.config.ts', 'Tests/Foo.ts', '.eslintrc.js']) {
      expect(isJunkPath(p), p).toBe(true);
    }
    for (const p of ['src/server.ts', 'src/latest/index.ts', 'lib/redis.ts']) {
      expect(isJunkPath(p), p).toBe(false);
    }
  });
});
