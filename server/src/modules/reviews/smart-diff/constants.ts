/**
 * Smart Diff constants: display order and the path -> role rules.
 */
import type { SmartDiffRole } from '@devdigest/shared';

/** Group display order in the Smart Diff view. */
export const SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
];

/**
 * Ordered classification rules; the FIRST matching rule wins, unmatched paths
 * are `core`. Patterns run against a normalized path (`/` separators, no
 * leading `./`). Order: boilerplate > tests > wiring > docs > core.
 *
 * Accepted limitations / deliberate outcomes:
 *  - a basename `index.ts|js` is treated as wiring even when it holds logic;
 *  - `__tests__/__snapshots__/x.snap` is boilerplate (boilerplate precedes tests);
 *  - `e2e/README.md` is tests (the tests rule precedes docs);
 *  - `.claude/skills/*\/SKILL.md` is wiring (wiring precedes docs).
 */
export const CLASSIFY_RULES: readonly { role: SmartDiffRole; patterns: RegExp[] }[] = [
  {
    // Generated / vendored output: lock files, snapshots, generated and minified code, build output.
    role: 'boilerplate',
    patterns: [
      /(^|\/)[^/]+\.lock$/,
      /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/,
      /(^|\/)[^/]+\.snap$/,
      /(^|\/)[^/]+\.generated\.[^/]+$/,
      /(^|\/)[^/]+\.min\.js$/,
      /^(dist|build)\//,
      /(^|\/)__snapshots__\//,
    ],
  },
  {
    // Tests and test support: test/spec files, test directories, the e2e package.
    role: 'tests',
    patterns: [
      /(^|\/)[^/]+\.(test|spec)\.[jt]sx?$/,
      /(^|\/)(test|tests|__tests__)\//,
      /^e2e\//,
    ],
  },
  {
    // Wiring: barrels, tool/config files, env files, CI and agent config.
    role: 'wiring',
    patterns: [
      /(^|\/)index\.(ts|js)$/,
      /(^|\/)[^/]+\.config\.[^/]+$/,
      /(^|\/)tsconfig[^/]*\.json$/,
      /(^|\/)\.eslintrc[^/]*$/,
      /(^|\/)\.env[^/]*$/,
      /(^|\/)docker-compose[^/]*\.ya?ml$/,
      /^(\.github|\.claude)\//,
    ],
  },
  {
    // Docs: markdown, README/CHANGELOG/LICENSE, the root docs/ folder.
    role: 'docs',
    patterns: [
      /(^|\/)[^/]+\.md$/,
      /(^|\/)README[^/]*$/,
      /(^|\/)CHANGELOG[^/]*$/,
      /(^|\/)LICENSE$/,
      /^docs\//,
    ],
  },
];
