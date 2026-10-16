import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Entry-layer redaction. `redactSecrets` is exported; `safeErrorText` is not,
 * so it is exercised through the smallest seam that reaches it: running
 * `index.ts` as the direct entry (process.argv[1]) with `main()` rejecting,
 * which logs `[agent-runner] FAILED: ${safeErrorText(err)}`.
 */

const OR_SENTINEL = 'sk-or-SENTINEL-redact-31c0';
const GH_SENTINEL = 'ghp_SENTINEL_redact_77ab';

const { PROVIDER } = vi.hoisted(() => ({
  PROVIDER: { ctorThrows: undefined as unknown, throwing: false, llmError: undefined as unknown },
}));
vi.mock('@devdigest/reviewer-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@devdigest/reviewer-core')>();
  class FakeOpenRouterProvider {
    id = 'openrouter';
    constructor() {
      if (PROVIDER.throwing) throw PROVIDER.ctorThrows;
    }
    async listModels() {
      return [];
    }
    async complete() {
      throw new Error('unused');
    }
    async completeStructured(): Promise<never> {
      throw PROVIDER.llmError;
    }
    async embed() {
      return [];
    }
  }
  return { ...actual, OpenRouterProvider: FakeOpenRouterProvider };
});

import { redactSecrets, main } from './index.js';

describe('redactSecrets', () => {
  it('replaces both secret values with *** everywhere they occur', () => {
    const env = { OPENROUTER_API_KEY: OR_SENTINEL, GITHUB_TOKEN: GH_SENTINEL };

    const out = redactSecrets(`a ${OR_SENTINEL} b ${GH_SENTINEL} c ${OR_SENTINEL}`, env);

    expect(out).toBe('a *** b *** c ***');
  });

  it('ignores unset and empty values (an empty string must not wipe the text)', () => {
    expect(redactSecrets('plain text', {})).toBe('plain text');
    expect(redactSecrets('plain text', { OPENROUTER_API_KEY: '', GITHUB_TOKEN: undefined })).toBe('plain text');
  });

  it('leaves text without a secret untouched and redacts only the secrets that are set', () => {
    expect(redactSecrets(`tok ${GH_SENTINEL}`, { GITHUB_TOKEN: GH_SENTINEL })).toBe('tok ***');
    expect(redactSecrets(`key ${OR_SENTINEL}`, { GITHUB_TOKEN: GH_SENTINEL })).toBe(`key ${OR_SENTINEL}`);
  });

  it('treats secret values literally (regex metacharacters do not break or over-match)', () => {
    expect(redactSecrets('a.c abc', { GITHUB_TOKEN: 'a.c' })).toBe('*** abc');
  });
});

describe('failure logging in the direct-run entry (safeErrorText)', () => {
  let errLines: string[];
  let savedArgv1: string | undefined;
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    errLines = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errLines.push(a.map(String).join(' '));
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('OPENROUTER_API_KEY', OR_SENTINEL);
    vi.stubEnv('GITHUB_TOKEN', GH_SENTINEL);
    savedArgv1 = process.argv[1];
    savedExitCode = process.exitCode;
    PROVIDER.throwing = true;
    vi.resetModules();
  });

  afterEach(() => {
    PROVIDER.throwing = false;
    process.argv[1] = savedArgv1 as string;
    process.exitCode = savedExitCode;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /** Re-import index.ts as if it were the process entry and wait for its failure log. */
  async function runAsEntry(): Promise<string> {
    process.argv[1] = path.resolve(__dirname, 'index.ts');
    expect(pathToFileURL(process.argv[1]).href).toMatch(/index\.ts$/);
    await import('./index.js');
    await vi.waitFor(() => expect(errLines.length).toBeGreaterThan(0));
    return errLines.join('\n');
  }

  it('prints only "name: message" for an Error, never its stack or cause, with secrets replaced', async () => {
    const err = new TypeError(`bad header Bearer ${GH_SENTINEL} for ${OR_SENTINEL}`, {
      cause: new Error(`inner cause with ${GH_SENTINEL}`),
    });
    err.stack = `TypeError: stack-frame-marker ${GH_SENTINEL}\n    at secretFn (file.ts:1:1)`;
    PROVIDER.ctorThrows = err;

    const line = await runAsEntry();

    expect(line).toBe('[agent-runner] FAILED: TypeError: bad header Bearer *** for ***');
    expect(process.exitCode).toBe(1);
  });

  it('prints a thrown string (redacted) as-is', async () => {
    PROVIDER.ctorThrows = `plain failure ${OR_SENTINEL}`;

    expect(await runAsEntry()).toBe('[agent-runner] FAILED: plain failure ***');
  });

  it('prints a generic message for a non-Error, non-string value instead of stringifying it', async () => {
    PROVIDER.ctorThrows = { headers: { authorization: `Bearer ${GH_SENTINEL}` }, toString: () => GH_SENTINEL };

    const line = await runAsEntry();

    expect(line).toBe('[agent-runner] FAILED: unknown error');
    expect(line).not.toContain(GH_SENTINEL);
  });
});

describe('main() failure output', () => {
  let dir: string;
  let logged: string[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-redact-'));
    mkdirSync(path.join(dir, 'agents'), { recursive: true });
    writeFileSync(
      path.join(dir, 'agents', 'a.yaml'),
      'name: "R"\nmodel: "m"\nsystem_prompt: "p"\nskills: []\nstrategy: "single-pass"\nci_fail_on: "critical"\n',
    );
    writeFileSync(
      path.join(dir, 'event.json'),
      JSON.stringify({
        pull_request: { number: 1, title: 't', body: 'b', head: { sha: 'd'.repeat(40) } },
        repository: { id: 2 },
      }),
    );
    logged = [];
    const capture = (...a: unknown[]) => {
      logged.push(a.map(String).join(' '));
    };
    vi.spyOn(console, 'error').mockImplementation(capture);
    vi.spyOn(console, 'log').mockImplementation(capture);
    PROVIDER.throwing = false;
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,2 @@\n x\n+y\n',
          { status: 200 },
        ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('redacts secrets from the error a failed run reports and exits 1', async () => {
    PROVIDER.llmError = new Error(`401 from provider: key ${OR_SENTINEL}, token ${GH_SENTINEL}`);

    const code = await main({
      DEVDIGEST_DIR: dir,
      DEVDIGEST_RESULT_PATH: path.join(dir, 'out.json'),
      GITHUB_REPOSITORY: 'o/r',
      PR_NUMBER: '1',
      GITHUB_EVENT_PATH: path.join(dir, 'event.json'),
      GITHUB_TOKEN: GH_SENTINEL,
      OPENROUTER_API_KEY: OR_SENTINEL,
    });

    expect(code).toBe(1);
    const text = logged.join('\n');
    expect(text).toContain('[agent-runner] FAILED:');
    expect(text).toContain('key ***, token ***');
    expect(text).not.toContain(OR_SENTINEL);
    expect(text).not.toContain(GH_SENTINEL);
  });
});
