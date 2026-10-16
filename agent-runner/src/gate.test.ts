import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LLMProvider, StructuredResult, Review } from '@devdigest/shared';
import { runCi } from './run.js';
import type { FetchLike } from './github.js';

/**
 * Gate / exit code: exit 1 iff the deterministic gate (grounded findings vs
 * `ci_fail_on`) trips. Expected values are hand-computed from the severity
 * ranking SUGGESTION < WARNING < CRITICAL and the thresholds
 * never (nothing) / critical / warning / any.
 */

const DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,4 +1,6 @@
 line1
+line2
+line3
+line4
 line5
 line6
`;

type Sev = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

function finding(id: string, severity: Sev, line: number) {
  return {
    id,
    severity,
    category: 'bug' as const,
    title: `t-${id}`,
    file: 'src/a.ts',
    start_line: line,
    end_line: line,
    rationale: 'r',
    confidence: 0.9,
    kind: 'finding' as const,
  };
}

function llmReturning(review: Review): LLMProvider {
  return {
    id: 'openrouter',
    async listModels() {
      return [];
    },
    async complete() {
      throw new Error('unused');
    },
    async completeStructured<T>(): Promise<StructuredResult<T>> {
      return { data: review as unknown as T, model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '{}', attempts: 1 };
    },
    async embed() {
      return [];
    },
  };
}

describe('gate + exit code', () => {
  let dir: string;
  let posted: string[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-gate-'));
    mkdirSync(path.join(dir, 'agents'), { recursive: true });
    writeFileSync(
      path.join(dir, 'event.json'),
      JSON.stringify({
        pull_request: { number: 3, title: 't', body: 'b', head: { sha: 'c'.repeat(40) } },
        repository: { id: 8 },
      }),
    );
    posted = [];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function run(failOn: string, severities: Sev[], modelVerdict: Review['verdict'] = 'approve') {
    writeFileSync(
      path.join(dir, 'agents', 'a.yaml'),
      `name: "G"\nmodel: "m"\nsystem_prompt: "p"\nskills: []\nstrategy: "single-pass"\nci_fail_on: "${failOn}"\n`,
    );
    // Lines 2..4 are added lines in the hunk, so all findings are grounded.
    const findings = severities.map((s, i) => finding(`f${i}`, s, 2 + i));
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      posted.push(String(init?.body ?? ''));
      return new Response('{}', { status: 200 });
    }) as unknown as FetchLike;
    return runCi({
      devdigestDir: dir,
      env: { GITHUB_REPOSITORY: 'o/r', PR_NUMBER: '3', GITHUB_EVENT_PATH: path.join(dir, 'event.json'), GITHUB_TOKEN: 't' },
      llm: llmReturning({ verdict: modelVerdict, summary: 's', score: 50, findings }),
      postAs: 'github_review',
      resultPath: path.join(dir, 'devdigest-result.json'),
      fetchDiff: async () => DIFF,
      fetchImpl,
    });
  }

  it.each<[string, Sev[], number, boolean]>([
    // [ci_fail_on, finding severities, expected blockers, expected gate]
    ['never', ['CRITICAL', 'WARNING', 'SUGGESTION'], 0, false],
    ['critical', ['WARNING', 'SUGGESTION'], 0, false],
    ['critical', ['CRITICAL', 'WARNING'], 1, true],
    ['warning', ['SUGGESTION'], 0, false],
    ['warning', ['WARNING', 'SUGGESTION', 'CRITICAL'], 2, true],
    ['any', ['SUGGESTION'], 1, true],
    ['any', [], 0, false],
  ])('ci_fail_on=%s with %j -> blockers=%i, gate=%s, exit code follows the gate', async (failOn, sev, blockers, gate) => {
    const result = await run(failOn, sev);

    expect(result.error).toBeUndefined();
    expect(result.blockers).toBe(blockers);
    expect(result.gateTriggered).toBe(gate);
    expect(result.exitCode).toBe(gate ? 1 : 0);
    expect(result.artifact?.verdict).toBe(gate ? 'fail' : 'pass');
    expect(result.artifact?.blockers).toBe(blockers);
    expect(JSON.parse(posted[0]!).event).toBe(gate ? 'REQUEST_CHANGES' : 'COMMENT');
  });

  it('ignores a model-claimed request_changes verdict when no grounded finding reaches the threshold', async () => {
    const result = await run('critical', ['SUGGESTION'], 'request_changes');

    expect(result.gateTriggered).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  it('a findings-free approve posts an APPROVE-downgraded COMMENT and exits 0', async () => {
    const result = await run('critical', []);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(posted[0]!).event).toBe('COMMENT');
  });
});
