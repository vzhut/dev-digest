/**
 * Path -> Smart Diff role. Pure; first matching rule wins, default `core`.
 */
import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_RULES } from './constants.js';

export function classifyFile(path: string): SmartDiffRole {
  const p = path.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const rule of CLASSIFY_RULES) {
    if (rule.patterns.some((re) => re.test(p))) return rule.role;
  }
  return 'core';
}
