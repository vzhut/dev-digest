import { describe, it, expect } from 'vitest';
import type { GitHubReviewPayload } from '@devdigest/shared';
import { fetchPrDiff, postGithubReview, postPrComment, type FetchLike } from './github.js';
import { RunnerError } from './errors.js';

/**
 * Hermetic tests for the hand-rolled GitHub REST client — a scripted `fetch`
 * replays the given statuses in order and records every request.
 */

const CTX = { owner: 'acme', repo: 'widgets', prNumber: 42 };
const TOKEN = 'ghp_SENTINEL_github_client';

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

function scriptedFetch(responses: { status: number; text?: string }[]): { fetchImpl: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  let i = 0;
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
    });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return new Response(r.text ?? '{}', { status: r.status });
  }) as unknown as FetchLike;
  return { fetchImpl, calls };
}

const WITH_COMMENTS: GitHubReviewPayload = {
  body: 'summary body',
  event: 'REQUEST_CHANGES',
  comments: [{ path: 'src/a.ts', line: 10, body: 'inline note' }],
};

describe('fetchPrDiff', () => {
  it('requests the PR with the diff media type and a bearer token, and returns the text', async () => {
    const { fetchImpl, calls } = scriptedFetch([{ status: 200, text: 'diff --git a/x b/x' }]);

    const diff = await fetchPrDiff(CTX, TOKEN, fetchImpl);

    expect(diff).toBe('diff --git a/x b/x');
    expect(calls[0]!.url).toBe('https://api.github.com/repos/acme/widgets/pulls/42');
    expect(calls[0]!.headers.Accept).toBe('application/vnd.github.v3.diff');
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('throws a RunnerError carrying the status on a non-2xx response, without the token', async () => {
    const { fetchImpl } = scriptedFetch([{ status: 404, text: 'Not Found' }]);

    const err = await fetchPrDiff(CTX, TOKEN, fetchImpl).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RunnerError);
    expect((err as Error).message).toContain('404');
    expect((err as Error).message).not.toContain(TOKEN);
  });
});

describe('postGithubReview', () => {
  it('posts to the reviews endpoint with body, event and only path/line/body on each inline comment', async () => {
    const { fetchImpl, calls } = scriptedFetch([{ status: 200 }]);
    const payload = {
      ...WITH_COMMENTS,
      comments: [{ path: 'src/a.ts', line: 10, body: 'inline note', extra: 'drop-me' }],
    } as unknown as GitHubReviewPayload;

    await postGithubReview(CTX, TOKEN, payload, fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.github.com/repos/acme/widgets/pulls/42/reviews');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({
      body: 'summary body',
      event: 'REQUEST_CHANGES',
      comments: [{ path: 'src/a.ts', line: 10, body: 'inline note' }],
    });
  });

  it('downgrades APPROVE to COMMENT (the Actions token cannot approve) and keeps the body', async () => {
    const { fetchImpl, calls } = scriptedFetch([{ status: 200 }]);

    await postGithubReview(CTX, TOKEN, { body: 'Approved', event: 'APPROVE' }, fetchImpl);

    expect(calls[0]!.body).toEqual({ body: 'Approved', event: 'COMMENT' });
  });

  it('leaves COMMENT and REQUEST_CHANGES events untouched', async () => {
    const { fetchImpl, calls } = scriptedFetch([{ status: 200 }]);

    await postGithubReview(CTX, TOKEN, { body: 'b', event: 'COMMENT' }, fetchImpl);
    await postGithubReview(CTX, TOKEN, { body: 'b', event: 'REQUEST_CHANGES' }, fetchImpl);

    expect(calls.map((c) => c.body!.event)).toEqual(['COMMENT', 'REQUEST_CHANGES']);
  });

  it('retries once body-only (no inline comments, same body and event) after a 422 on inline comments', async () => {
    const { fetchImpl, calls } = scriptedFetch([{ status: 422, text: 'diff too large' }, { status: 200 }]);

    await postGithubReview(CTX, TOKEN, WITH_COMMENTS, fetchImpl);

    expect(calls).toHaveLength(2);
    expect(calls[0]!.body).toHaveProperty('comments');
    expect(calls[1]!.body).toEqual({ body: 'summary body', event: 'REQUEST_CHANGES' });
    expect(calls[1]!.url).toBe(calls[0]!.url);
  });

  it('throws when the body-only retry also fails, naming the final status', async () => {
    const { fetchImpl, calls } = scriptedFetch([{ status: 422 }, { status: 500, text: 'boom' }]);

    await expect(postGithubReview(CTX, TOKEN, WITH_COMMENTS, fetchImpl)).rejects.toThrow(/500/);
    expect(calls).toHaveLength(2);
  });

  it('does not retry a 422 when there were no inline comments', async () => {
    const { fetchImpl, calls } = scriptedFetch([{ status: 422, text: 'unprocessable' }]);

    const err = await postGithubReview(CTX, TOKEN, { body: 'b', event: 'COMMENT' }, fetchImpl).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(RunnerError);
    expect((err as Error).message).toContain('422');
    expect(calls).toHaveLength(1);
  });

  it('does not retry on non-422 failures even with inline comments', async () => {
    const { fetchImpl, calls } = scriptedFetch([{ status: 500 }]);

    await expect(postGithubReview(CTX, TOKEN, WITH_COMMENTS, fetchImpl)).rejects.toThrow(RunnerError);
    expect(calls).toHaveLength(1);
  });
});

describe('postPrComment', () => {
  it('posts a bare issue comment ({ body } only, no review event) to the issues endpoint', async () => {
    const { fetchImpl, calls } = scriptedFetch([{ status: 201 }]);

    await postPrComment(CTX, TOKEN, 'hello', fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.github.com/repos/acme/widgets/issues/42/comments');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({ body: 'hello' });
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('throws a RunnerError with the status on failure', async () => {
    const { fetchImpl } = scriptedFetch([{ status: 403, text: 'forbidden' }]);

    const err = await postPrComment(CTX, TOKEN, 'hello', fetchImpl).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RunnerError);
    expect((err as Error).message).toContain('403');
  });
});
