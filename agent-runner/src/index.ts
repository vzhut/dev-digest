/**
 * @devdigest/agent-runner — CI runner CLI (T8).
 *
 * Invoked by the generated GitHub Actions workflow as
 * `node .devdigest/runner/index.js` (`server/src/modules/ci/constants.ts` /
 * `workflow.ts`) — bundled by `ncc` into a single self-contained
 * `dist/index.js` (T7) with no runtime dependency on `node_modules/@devdigest/*`.
 *
 * Reads CI-injected env vars directly (OPENROUTER_API_KEY, GITHUB_TOKEN,
 * GITHUB_REPOSITORY, PR_NUMBER). This is intentional, not a `SecretsProvider`
 * bypass: the runner executes OUTSIDE the server DI graph (in the target
 * repo's own CI), so the `SecretsProvider`/`process.env` chokepoint — which is
 * scoped to `server/` — does not apply here (see `agent-runner/CLAUDE.md`).
 *
 * All actual logic lives in `run.ts` (`runCi`), which takes every dependency
 * (fs, fetch, LLM provider, clock) as an injectable parameter so it can be
 * unit-tested hermetically. This file only wires those dependencies to the
 * real world and maps the result onto `process.exitCode`.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { runCi, type PostAs } from './run.js';

/** Valid env value or `undefined` — `runCi` then falls back to the manifest, then `github_review`. */
function resolvePostAs(value: string | undefined): PostAs | undefined {
  if (value === 'github_review' || value === 'pr_comment' || value === 'none') return value;
  return undefined;
}

/**
 * Safe-to-log text for a failure: the error's name + message only (never the raw
 * object, stack, `cause`, request headers or response bodies), with the values of
 * the CI secrets replaced by `***` (AC-35).
 */
export function redactSecrets(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const key of ['OPENROUTER_API_KEY', 'GITHUB_TOKEN']) {
    const value = env[key];
    if (value) out = out.split(value).join('***');
  }
  return out;
}

function safeErrorText(err: unknown, env: NodeJS.ProcessEnv = process.env): string {
  const text =
    err instanceof Error ? `${err.name}: ${err.message}` : typeof err === 'string' ? err : 'unknown error';
  return redactSecrets(text, env);
}

export async function main(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const devdigestDir = env.DEVDIGEST_DIR ?? path.join(process.cwd(), '.devdigest');
  const resultPath = env.DEVDIGEST_RESULT_PATH ?? path.join(process.cwd(), 'devdigest-result.json');
  const postAs = resolvePostAs(env.DEVDIGEST_POST_AS);

  // No global LLM client — always injected (reviewer-core invariant). An empty
  // key still constructs the provider; the first `completeStructured` call
  // will fail (and be caught by `runCi`'s hard-fail path) rather than the
  // runner crashing before it can report a clear error.
  const llm = new OpenRouterProvider(env.OPENROUTER_API_KEY ?? '');

  const result = await runCi({
    devdigestDir,
    env,
    llm,
    postAs,
    nodeVersion: process.version,
    resultPath,
    readFile: readFileSync,
    readDir: readdirSync,
    writeFile: writeFileSync,
  });

  if (result.artifact === null) {
    console.error(`[agent-runner] FAILED: ${redactSecrets(result.error, env)}`);
  } else {
    console.log(
      `[agent-runner] findings=${result.artifact.findings_count} blockers=${result.blockers} ` +
        `gateTriggered=${result.gateTriggered} posted=${result.posted.kind}`,
    );
  }
  return result.exitCode;
}

// Only run when executed directly (CI), never on import (tests import `main`
// / `runCi` directly and drive them with injected fixtures).
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(`[agent-runner] FAILED: ${safeErrorText(err)}`);
      process.exitCode = 1;
    },
  );
}
