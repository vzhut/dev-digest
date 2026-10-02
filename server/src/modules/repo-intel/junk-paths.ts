/**
 * Path kinds excluded from rank-driven file samples (conventions, onboarding
 * tour): tests, configs, declaration files, migrations, generated dirs.
 * Matched as a substring of `'/' + path.toLowerCase()` so a root-level
 * `test/x.ts` is caught by `/test/` just like a nested one (AC-12).
 */
export const JUNK_PATH_PATTERNS = [
  '.test.',
  '.spec.',
  '.d.ts',
  '__tests__/',
  '__mocks__/',
  '/test/',
  '/tests/',
  '/migrations/',
  '/__fixtures__/',
  '.config.',
  'vitest.',
  'jest.',
  'eslint',
  'prettier',
] as const;

export function isJunkPath(path: string): boolean {
  const haystack = '/' + path.toLowerCase();
  return JUNK_PATH_PATTERNS.some((p) => haystack.includes(p));
}
