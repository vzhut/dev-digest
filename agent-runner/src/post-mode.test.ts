import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LLMProvider, StructuredResult, Review } from '@devdigest/shared';
import { runCi, type RunCiDeps } from './run.js';
import type { FetchLike } from './github.js';

// `main()` builds a real OpenRouterProvider; swap it for a canned one so the
// env-resolution tests below never touch the network.
const { REVIEW_HOLDER } = vi.hoisted(() => ({ REVIEW_HOLDER: { review: null as unknown } }));
vi.mock('@devdigest/reviewer-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@devdigest/reviewer-core')>();
  class FakeOpenRouterProvider {
    id = 'openrouter';
    async listModels() {
      return [];
    }
    async complete() {
      throw new Error('unused');
    }
    async completeStructured() {
      return {
        data: REVIEW_HOLDER.review,
        model: 'm',
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0.001,
        raw: '{}',
        attempts: 1,
      };
    }
    async embed() {
      return [];
    }
  }
  return { ...actual, OpenRouterProvider: FakeOpenRouterProvider };
});

import { main } from './index.js';

const HEAD_SHA = 'f'.repeat(40);
const DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 export {};
`;

const CLEAN_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 95, findings: [] };

function manifestYaml(postAs?: string): string {
  return `
name: "Reviewer"
model: "m/model"
system_prompt: "Review."
skills: []
strategy: "single-pass"
ci_fail_on: "critical"
${postAs ? `post_as: ${postAs}\n` : ''}`;
}

function llm(): LLMProvider {
  return {
    id: 'openrouter',
    async listModels() {
      return [];
    },
    async complete() {
      throw new Error('unused');
    },
    async completeStructured<T>(): Promise<StructuredResult<T>> {
      return { data: CLEAN_REVIEW as unknown as T, model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '{}', attempts: 1 };
    },
    async embed() {
      return [];
    },
  };
}

describe('post mode resolution', () => {
  let dir: string;
  let resultPath: string;
  let calls: { url: string; method: string }[];
  let fetchImpl: FetchLike;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-postmode-'));
    mkdirSync(path.join(dir, 'agents'), { recursive: true });
    writeFileSync(
      path.join(dir, 'event.json'),
      JSON.stringify({
        pull_request: { number: 5, title: 't', body: 'b', head: { sha: HEAD_SHA, repo: { fork: false } } },
        repository: { id: 11 },
      }),
    );
    resultPath = path.join(dir, 'devdigest-result.json');
    calls = [];
    fetchImpl = (async (input: unknown, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url: String(input), method });
      return method === 'GET' ? new Response(DIFF, { status: 200 }) : new Response('{}', { status: 200 });
    }) as unknown as FetchLike;
    REVIEW_HOLDER.review = CLEAN_REVIEW;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  const posts = () => calls.filter((c) => c.method === 'POST');

  function runWith(postAsDep: RunCiDeps['postAs'], manifestPostAs?: string, token: string | null = 'tok') {
    writeFileSync(path.join(dir, 'agents', 'a.yaml'), manifestYaml(manifestPostAs));
    return runCi({
      devdigestDir: dir,
      env: {
        GITHUB_REPOSITORY: 'acme/widgets',
        PR_NUMBER: '5',
        GITHUB_EVENT_PATH: path.join(dir, 'event.json'),
        ...(token ? { GITHUB_TOKEN: token } : {}),
      },
      llm: llm(),
      postAs: postAsDep,
      resultPath,
      fetchImpl,
    });
  }

  describe('runCi', () => {
    it('defaults to github_review when neither the dependency nor the manifest sets a mode', async () => {
      const result = await runWith(undefined);

      expect(result.posted?.kind).toBe('github_review');
      expect(posts().map((c) => c.url)).toEqual(['https://api.github.com/repos/acme/widgets/pulls/5/reviews']);
    });

    it('uses the manifest post_as when the explicit mode is absent', async () => {
      const result = await runWith(undefined, 'pr_comment');

      expect(result.posted?.kind).toBe('pr_comment');
      expect(posts().map((c) => c.url)).toEqual(['https://api.github.com/repos/acme/widgets/issues/5/comments']);
    });

    it('lets the explicit mode (workflow env) win over the manifest post_as', async () => {
      const result = await runWith('github_review', 'none');

      expect(result.posted?.kind).toBe('github_review');
      expect(posts()).toHaveLength(1);
      expect(posts()[0]!.url).toMatch(/\/pulls\/5\/reviews$/);
    });

    it('post_as none posts nothing, still writes the artifact, and needs no GITHUB_TOKEN', async () => {
      const result = await runWith('none', undefined, null);

      expect(result.error).toBeUndefined();
      expect(result.posted?.kind).toBe('none');
      expect(posts()).toHaveLength(0);
      expect(existsSync(resultPath)).toBe(true);
    });

    it('hard-fails before fetching or writing anything when a posting mode needs a missing GITHUB_TOKEN', async () => {
      const result = await runWith('pr_comment', undefined, null);

      expect(result.exitCode).toBe(1);
      expect(result.artifact).toBeNull();
      expect(result.error).toMatch(/GITHUB_TOKEN is required to post as 'pr_comment'/);
      expect(calls).toHaveLength(0);
      expect(existsSync(resultPath)).toBe(false);
    });

    it('posts exactly one issue comment (not a review) for pr_comment', async () => {
      await runWith('pr_comment');

      expect(posts()).toHaveLength(1);
      expect(posts()[0]!.url).toContain('/issues/5/comments');
    });
  });

  describe('main() env resolution of DEVDIGEST_POST_AS', () => {
    function mainEnv(postAs: string | undefined, manifestPostAs?: string): NodeJS.ProcessEnv {
      writeFileSync(path.join(dir, 'agents', 'a.yaml'), manifestYaml(manifestPostAs));
      vi.stubGlobal('fetch', fetchImpl);
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      return {
        DEVDIGEST_DIR: dir,
        DEVDIGEST_RESULT_PATH: resultPath,
        GITHUB_REPOSITORY: 'acme/widgets',
        PR_NUMBER: '5',
        GITHUB_EVENT_PATH: path.join(dir, 'event.json'),
        GITHUB_TOKEN: 'tok',
        OPENROUTER_API_KEY: 'key',
        ...(postAs === undefined ? {} : { DEVDIGEST_POST_AS: postAs }),
      };
    }

    it('env value wins over the manifest post_as', async () => {
      const code = await main(mainEnv('pr_comment', 'none'));

      expect(code).toBe(0);
      expect(posts().map((c) => c.url)).toEqual(['https://api.github.com/repos/acme/widgets/issues/5/comments']);
    });

    it('env none suppresses posting even though the manifest asks for pr_comment', async () => {
      const code = await main(mainEnv('none', 'pr_comment'));

      expect(code).toBe(0);
      expect(posts()).toHaveLength(0);
    });

    it.each(['bogus', 'GITHUB_REVIEW', ''])(
      'ignores the invalid env value %j and falls back to the manifest post_as',
      async (bad) => {
        await main(mainEnv(bad, 'none'));

        expect(posts()).toHaveLength(0);
      },
    );

    it('falls back to github_review when the env value is invalid and the manifest has no post_as', async () => {
      await main(mainEnv('bogus'));

      expect(posts().map((c) => c.url)).toEqual(['https://api.github.com/repos/acme/widgets/pulls/5/reviews']);
    });
  });
});
