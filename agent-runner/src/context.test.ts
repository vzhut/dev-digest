import { describe, it, expect } from 'vitest';
import type { readFileSync } from 'node:fs';
import { resolvePrContext, type CiEnv } from './context.js';
import { RunnerError } from './errors.js';

/** Fake `readFile` serving one in-memory event payload (or throwing ENOENT). */
function fakeRead(files: Record<string, string>): typeof readFileSync {
  return ((p: string) => {
    if (!(p in files)) throw new Error(`ENOENT: ${p}`);
    return files[p];
  }) as unknown as typeof readFileSync;
}

const SHA = 'abcdef0123456789abcdef0123456789abcdef01';
const EVENT_PATH = '/event.json';

function event(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    pull_request: {
      number: 7,
      title: 'My PR',
      body: 'My body',
      head: { sha: SHA, repo: { fork: false } },
    },
    repository: { id: 987654 },
    ...overrides,
  });
}

function env(extra: Partial<CiEnv> = {}): CiEnv {
  return { GITHUB_REPOSITORY: 'acme/widgets', PR_NUMBER: '7', GITHUB_EVENT_PATH: EVENT_PATH, ...extra };
}

describe('resolvePrContext', () => {
  it('reads head sha and repository id from the event payload alongside the env-derived fields', () => {
    const ctx = resolvePrContext(env(), fakeRead({ [EVENT_PATH]: event() }));

    expect(ctx).toEqual({
      owner: 'acme',
      repo: 'widgets',
      repository: 'acme/widgets',
      repositoryId: 987654,
      headSha: SHA,
      prNumber: 7,
      title: 'My PR',
      body: 'My body',
      isFork: false,
    });
  });

  it('detects a fork PR from pull_request.head.repo.fork', () => {
    const payload = JSON.stringify({
      pull_request: { number: 7, head: { sha: SHA, repo: { fork: true } } },
      repository: { id: 1 },
    });

    expect(resolvePrContext(env(), fakeRead({ [EVENT_PATH]: payload })).isFork).toBe(true);
  });

  it('treats a missing head.repo (deleted fork) and a null body as not-fork / empty body', () => {
    const payload = JSON.stringify({
      pull_request: { number: 7, body: null, head: { sha: SHA, repo: null } },
      repository: { id: 1 },
    });

    const ctx = resolvePrContext(env(), fakeRead({ [EVENT_PATH]: payload }));

    expect(ctx.isFork).toBe(false);
    expect(ctx.body).toBe('');
    expect(ctx.title).toBe('');
  });

  it('falls back to pull_request.number from the payload when PR_NUMBER is unset', () => {
    const ctx = resolvePrContext(env({ PR_NUMBER: undefined }), fakeRead({ [EVENT_PATH]: event() }));
    expect(ctx.prNumber).toBe(7);
  });

  it.each([
    ['head.sha absent', { pull_request: { number: 7, head: {} }, repository: { id: 1 } }],
    ['pull_request absent', { repository: { id: 1 } }],
    ['sha too short', { pull_request: { number: 7, head: { sha: 'abc123' } }, repository: { id: 1 } }],
    ['sha has 41 chars', { pull_request: { number: 7, head: { sha: `${SHA}0` } }, repository: { id: 1 } }],
    ['sha has uppercase hex', { pull_request: { number: 7, head: { sha: SHA.toUpperCase() } }, repository: { id: 1 } }],
    ['sha has non-hex chars', { pull_request: { number: 7, head: { sha: 'g'.repeat(40) } }, repository: { id: 1 } }],
    ['sha is not a string', { pull_request: { number: 7, head: { sha: 12345 } }, repository: { id: 1 } }],
  ])('hard-fails with a RunnerError naming head.sha when %s', (_label, payload) => {
    const run = () => resolvePrContext(env(), fakeRead({ [EVENT_PATH]: JSON.stringify(payload) }));

    expect(run).toThrow(RunnerError);
    expect(run).toThrow(/pull_request\.head\.sha/);
  });

  it.each([
    ['repository absent', { pull_request: { number: 7, head: { sha: SHA } } }],
    ['id is a string', { pull_request: { number: 7, head: { sha: SHA } }, repository: { id: '12' } }],
    ['id is zero', { pull_request: { number: 7, head: { sha: SHA } }, repository: { id: 0 } }],
    ['id is fractional', { pull_request: { number: 7, head: { sha: SHA } }, repository: { id: 1.5 } }],
  ])('hard-fails with a RunnerError naming repository.id when %s', (_label, payload) => {
    const run = () => resolvePrContext(env(), fakeRead({ [EVENT_PATH]: JSON.stringify(payload) }));

    expect(run).toThrow(RunnerError);
    expect(run).toThrow(/repository\.id/);
  });

  it('hard-fails when the event file is unreadable or not JSON (payload then lacks sha)', () => {
    expect(() => resolvePrContext(env(), fakeRead({}))).toThrow(/head\.sha/);
    expect(() => resolvePrContext(env(), fakeRead({ [EVENT_PATH]: '{not json' }))).toThrow(/head\.sha/);
    expect(() => resolvePrContext(env({ GITHUB_EVENT_PATH: undefined }), fakeRead({}))).toThrow(/head\.sha/);
  });

  it('rejects a malformed GITHUB_REPOSITORY and a non-positive PR number', () => {
    const read = fakeRead({ [EVENT_PATH]: event() });

    expect(() => resolvePrContext(env({ GITHUB_REPOSITORY: 'no-slash' }), read)).toThrow(/GITHUB_REPOSITORY/);
    expect(() => resolvePrContext(env({ GITHUB_REPOSITORY: undefined }), read)).toThrow(RunnerError);
    expect(() => resolvePrContext(env({ PR_NUMBER: '0' }), read)).toThrow(/PR_NUMBER/);
    expect(() => resolvePrContext(env({ PR_NUMBER: 'abc' }), read)).toThrow(/PR_NUMBER/);
  });
});
