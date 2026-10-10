import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * The client keeps its own copy of `@devdigest/shared` and the two copies already
 * drift elsewhere (AgentManifest, provider enum). The EVAL contracts must not: this
 * compares only the eval regions, as text, so a one-character edit on either side fails.
 */
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const region = (text: string, from: string, to: string): string => {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`region markers not found: "${from}" … "${to}"`);
  return text.slice(start, end);
};

const SERVER = '../src/vendor/shared/contracts/';
const CLIENT = '../../client/src/vendor/shared/contracts/';

describe('eval contract parity (server vs client vendor/shared)', () => {
  it('eval-ci.ts: the eval region is identical in both copies', () => {
    const pick = (t: string) => region(t, '// Eval —', '// Compose Review');
    const server = pick(read(`${SERVER}eval-ci.ts`));
    const client = pick(read(`${CLIENT}eval-ci.ts`));
    expect(server).toContain('EvalSuiteRunDetail');
    expect(client).toBe(server);
  });

  it('knowledge.ts: the "---- Eval ----" block is identical in both copies', () => {
    const pick = (t: string) => region(t, '// ---- Eval ----', '// ---- Memory ----');
    const server = pick(read(`${SERVER}knowledge.ts`));
    const client = pick(read(`${CLIENT}knowledge.ts`));
    expect(server).toContain('EvalOwnerKind');
    expect(client).toBe(server);
  });
});
