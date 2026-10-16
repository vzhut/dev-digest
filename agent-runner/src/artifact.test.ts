import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LLMProvider, StructuredResult, Review } from '@devdigest/shared';
import { runCi } from './run.js';
import { buildResultArtifact, RUNNER_VERSION } from './artifact.js';
import type { FetchLike } from './github.js';

/**
 * Artifact contents + secret-leak check. Sentinel values for the two CI
 * secrets are present in the env handed to `runCi`; neither may reach the
 * written `devdigest-result.json`, the posted body, or any log output.
 */

const OPENROUTER_SENTINEL = 'sk-or-SENTINEL-9f3a1c77d2';
const GITHUB_SENTINEL = 'ghp_SENTINEL_5b8e04aa19';
const HEAD_SHA = '0123456789abcdef0123456789abcdef01234567';

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -9,3 +9,4 @@
 host: 'localhost',
+apiKey: 'sk_live_abcdef123456',
 port: 3000,
 timeout: 30,
`;

const MANIFEST = `
name: "Security Reviewer"
provider: "openrouter"
model: "deepseek/deepseek-v4-flash"
system_prompt: "Review this PR for security issues."
skills: ["sec-basics"]
strategy: "single-pass"
ci_fail_on: "critical"
version: 3
skill_versions:
  sec-basics: 2
`;

// One grounded CRITICAL (line 10 is in the hunk), one grounded WARNING (line 11),
// one hallucinated finding (line 999) that grounding must drop.
const REVIEW: Review = {
  verdict: 'approve',
  summary: 'fine',
  score: 90,
  findings: [
    mk('f1', 'CRITICAL', 10),
    mk('f2', 'WARNING', 11),
    mk('f3', 'CRITICAL', 999),
  ],
};

function mk(id: string, severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION', line: number) {
  return {
    id,
    severity,
    category: 'security' as const,
    title: `finding ${id}`,
    file: 'src/config.ts',
    start_line: line,
    end_line: line,
    rationale: 'because',
    confidence: 0.9,
    kind: 'finding' as const,
  };
}

function stubLlm(review: Review | Error, costUsd = 0.0125): LLMProvider {
  return {
    id: 'openrouter',
    async listModels() {
      return [];
    },
    async complete() {
      throw new Error('unused');
    },
    async completeStructured<T>(): Promise<StructuredResult<T>> {
      if (review instanceof Error) throw review;
      return {
        data: review as unknown as T,
        model: 'deepseek/deepseek-v4-flash',
        tokensIn: 10,
        tokensOut: 5,
        costUsd,
        raw: '{}',
        attempts: 1,
      };
    },
    async embed() {
      return [];
    },
  };
}

describe('devdigest-result.json + secret hygiene', () => {
  let dir: string;
  let resultPath: string;
  let logged: string[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-artifact-'));
    mkdirSync(path.join(dir, 'agents'), { recursive: true });
    mkdirSync(path.join(dir, 'skills'), { recursive: true });
    writeFileSync(path.join(dir, 'agents', 'sec.yaml'), MANIFEST);
    writeFileSync(path.join(dir, 'skills', 'sec-basics.md'), '# Security basics\nDo not commit secrets.');
    writeFileSync(
      path.join(dir, 'event.json'),
      JSON.stringify({
        pull_request: { number: 42, title: 'Add config', body: 'adds config', head: { sha: HEAD_SHA, repo: { fork: false } } },
        repository: { id: 424242 },
      }),
    );
    resultPath = path.join(dir, 'devdigest-result.json');

    logged = [];
    const capture = (...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    };
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
    vi.spyOn(console, 'warn').mockImplementation(capture);
    vi.spyOn(console, 'info').mockImplementation(capture);
    vi.spyOn(console, 'debug').mockImplementation(capture);
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      logged.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      logged.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  function recordingFetch(): { fetchImpl: FetchLike; bodies: string[] } {
    const bodies: string[] = [];
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ''));
      return new Response('{}', { status: 200 });
    }) as unknown as FetchLike;
    return { fetchImpl, bodies };
  }

  function deps(over: Partial<Parameters<typeof runCi>[0]> = {}) {
    const clock = [10_000, 10_750];
    return {
      devdigestDir: dir,
      env: {
        GITHUB_REPOSITORY: 'acme/widgets',
        PR_NUMBER: '42',
        GITHUB_EVENT_PATH: path.join(dir, 'event.json'),
        GITHUB_TOKEN: GITHUB_SENTINEL,
        OPENROUTER_API_KEY: OPENROUTER_SENTINEL,
      },
      llm: stubLlm(REVIEW),
      postAs: 'github_review' as const,
      nodeVersion: 'v22.23.0',
      resultPath,
      now: () => clock.shift() ?? 10_750,
      fetchDiff: async () => DIFF,
      ...over,
    };
  }

  it('writes exactly the expected fixed fields, derived from grounded findings and the injected clock', async () => {
    const { fetchImpl } = recordingFetch();

    const result = await runCi(deps({ fetchImpl }));

    expect(result.error).toBeUndefined();
    const onDisk = JSON.parse(readFileSync(resultPath, 'utf8')) as Record<string, unknown>;
    expect(onDisk).toEqual({
      artifact_version: 2,
      repository: 'acme/widgets',
      repository_id: 424242,
      head_sha: HEAD_SHA,
      findings_count: 2, // hallucinated line-999 finding dropped by grounding
      critical: 1,
      warning: 1,
      suggestion: 0,
      cost_usd: 0.0125,
      duration_ms: 750,
      agent: 'Security Reviewer',
      version: '2',
      pr_number: 42,
      blockers: 1, // ci_fail_on=critical: only the grounded CRITICAL
      verdict: 'fail',
      manifest_version: 3,
      model: 'deepseek/deepseek-v4-flash',
      runner_version: '2',
      node_version: 'v22.23.0',
      skill_versions: { 'sec-basics': 2 },
    });
    expect(onDisk.head_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(RUNNER_VERSION).toBe('2');
  });

  it('keeps both CI secrets out of the artifact, the posted review body and every log line (review post)', async () => {
    const { fetchImpl, bodies } = recordingFetch();

    const result = await runCi(deps({ fetchImpl, postAs: 'github_review' }));

    expect(result.exitCode).toBe(1);
    expect(bodies).toHaveLength(1);
    const artifactText = readFileSync(resultPath, 'utf8');
    for (const secret of [OPENROUTER_SENTINEL, GITHUB_SENTINEL]) {
      expect(artifactText).not.toContain(secret);
      expect(bodies.join('\n')).not.toContain(secret);
      expect(logged.join('\n')).not.toContain(secret);
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });

  it('keeps both CI secrets out of the posted PR comment body (pr_comment post)', async () => {
    const { fetchImpl, bodies } = recordingFetch();

    await runCi(deps({ fetchImpl, postAs: 'pr_comment' }));

    expect(bodies).toHaveLength(1);
    for (const secret of [OPENROUTER_SENTINEL, GITHUB_SENTINEL]) {
      expect(bodies[0]).not.toContain(secret);
      expect(readFileSync(resultPath, 'utf8')).not.toContain(secret);
      expect(logged.join('\n')).not.toContain(secret);
    }
  });

  it('on a hard-fail writes no artifact and posts nothing, so nothing can carry a secret', async () => {
    const { fetchImpl, bodies } = recordingFetch();

    const result = await runCi(deps({ fetchImpl, llm: stubLlm(new Error('model exploded')) }));

    expect(result.artifact).toBeNull();
    expect(bodies).toHaveLength(0);
    expect(() => readFileSync(resultPath, 'utf8')).toThrow(/ENOENT/);
    expect(logged.join('\n')).not.toContain(GITHUB_SENTINEL);
    expect(logged.join('\n')).not.toContain(OPENROUTER_SENTINEL);
  });

  it('records a pass verdict with zero blockers and a null cost when nothing trips the gate', async () => {
    const quiet: Review = { ...REVIEW, findings: [mk('w', 'WARNING', 11)] };
    const { fetchImpl } = recordingFetch();

    const result = await runCi(deps({ fetchImpl, llm: stubLlm(quiet, 0) }));

    expect(result.artifact).toMatchObject({ verdict: 'pass', blockers: 0, findings_count: 1, critical: 0, warning: 1 });
    expect(result.exitCode).toBe(0);
  });
});

describe('buildResultArtifact', () => {
  const base = {
    findings: [],
    costUsd: null,
    durationMs: 5,
    agent: 'A',
    prNumber: 1,
    repository: 'o/r',
    repositoryId: 9,
    headSha: HEAD_SHA,
    manifestVersion: undefined,
    model: 'm',
    skillVersions: undefined,
    nodeVersion: 'v22.0.0',
    gateTriggered: false,
    blockers: 0,
  };

  it('maps absent manifest version / skill versions to null and keeps a null cost', () => {
    const a = buildResultArtifact(base);

    expect(a.manifest_version).toBeNull();
    expect(a.skill_versions).toBeNull();
    expect(a.cost_usd).toBeNull();
    expect(a.verdict).toBe('pass');
    expect(a.findings_count).toBe(0);
  });

  it('fails loudly (RunnerError) rather than emitting an artifact the studio would reject', () => {
    expect(() => buildResultArtifact({ ...base, headSha: 'not-a-sha' })).toThrow(/CiResultArtifact validation/);
  });
});
