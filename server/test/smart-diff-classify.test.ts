import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/modules/reviews/smart-diff/classify.js';
import { SMART_DIFF_ROLE_ORDER } from '../src/modules/reviews/smart-diff/constants.js';

describe('classifyFile', () => {
  it.each([
    // boilerplate
    ['pnpm-lock.yaml', 'boilerplate'],
    ['server/package-lock.json', 'boilerplate'],
    ['client/yarn.lock', 'boilerplate'],
    ['Cargo.lock', 'boilerplate'],
    ['src/__snapshots__/a.test.ts.snap', 'boilerplate'],
    ['src/foo.snap', 'boilerplate'],
    ['src/api.generated.ts', 'boilerplate'],
    ['public/app.min.js', 'boilerplate'],
    ['dist/bundle.js', 'boilerplate'],
    ['build/out.js', 'boilerplate'],
    // Disputed: boilerplate precedes tests, so a snapshot inside __tests__ is boilerplate.
    ['__tests__/__snapshots__/x.snap', 'boilerplate'],
    // tests
    ['src/a.test.ts', 'tests'],
    ['src/A.test.tsx', 'tests'],
    ['server/test/a.it.test.ts', 'tests'],
    ['src/a.spec.ts', 'tests'],
    ['server/test/helper.ts', 'tests'],
    ['src/test/helper.ts', 'tests'],
    ['tests/foo.ts', 'tests'],
    ['src/__tests__/foo.ts', 'tests'],
    ['e2e/specs/01.flow.json', 'tests'],
    // Disputed: tests precede docs, so e2e/README.md stays tests.
    ['e2e/README.md', 'tests'],
    // wiring
    ['src/index.ts', 'wiring'],
    ['src/components/x/index.js', 'wiring'],
    ['vitest.config.ts', 'wiring'],
    ['tsconfig.json', 'wiring'],
    ['server/tsconfig.build.json', 'wiring'],
    ['.eslintrc.json', 'wiring'],
    ['.env.example', 'wiring'],
    ['docker-compose.yml', 'wiring'],
    ['docker-compose.prod.yml', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'],
    // Disputed: wiring precedes docs, so a .md under .claude/ is wiring.
    ['.claude/skills/security/SKILL.md', 'wiring'],
    // docs
    ['README.md', 'docs'],
    ['server/README', 'docs'],
    ['CHANGELOG.txt', 'docs'],
    ['LICENSE', 'docs'],
    ['notes/design.md', 'docs'],
    ['docs/guide/intro.png', 'docs'],
    // core
    ['src/app.ts', 'core'],
    ['server/src/modules/reviews/service.ts', 'core'],
    ['docs-site/src/a.ts', 'core'],
    ['src/testing.ts', 'core'],
  ] as const)('%s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it('normalizes backslashes and a leading ./', () => {
    expect(classifyFile('.\\src\\a.test.ts')).toBe('tests');
    expect(classifyFile('./pnpm-lock.yaml')).toBe('boilerplate');
    expect(classifyFile('.\\docs\\a.png')).toBe('docs');
  });

  it('exposes the display order', () => {
    expect(SMART_DIFF_ROLE_ORDER).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
  });
});
