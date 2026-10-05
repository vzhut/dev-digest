import { describe, it, expect, vi } from 'vitest';
import { issueRefsInTextOrder } from '../src/modules/intent/helpers.js';
import { IntentService, type IntentServiceDeps } from '../src/modules/intent/service.js';
import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { Db } from '../src/db/client.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const REPO = { owner: 'acme', name: 'payments-api' };
const URL13 = 'https://github.com/acme/payments-api/issues/13';

describe('issueRefsInTextOrder', () => {
  const order = (t: string) => issueRefsInTextOrder(t, REPO).map((r) => r.ref);

  it('keeps the author order across forms (the URL pass of extractReferences runs first)', () => {
    expect(order(`Fixes #12 and ${URL13}`)).toEqual(['#12', '#13']);
    expect(order(`See ${URL13} then #12`)).toEqual(['#13', '#12']);
  });

  it('keeps a cross-repo ref in order, flagged, and de-dupes by earliest occurrence', () => {
    const r = issueRefsInTextOrder('other/repo#9 then #5 and #5 and acme/payments-api#5', REPO);
    expect(r.map((x) => [x.ref, x.sameRepo])).toEqual([
      ['other/repo#9', false],
      ['#5', true],
    ]);
  });

  it('ignores non-issue GitHub URLs and respects the scan cap', () => {
    expect(order('https://github.com/acme/payments-api/pull/3')).toEqual([]);
    expect(order('ab '.repeat(30_000) + '#7')).toEqual([]);
  });
});

function makeService(body: string | null, getIssue: () => Promise<unknown>, repoName = 'payments-api') {
  const github = vi.fn(async () => ({ getIssue }) as never);
  const deps = {
    repo: {
      getPullForWorkspace: async (ws: string) => (ws === 'ws' ? { id: 'p1', repoId: 'r1', body } : undefined),
      getRepo: async () => ({ owner: 'acme', name: repoName }),
    },
    github,
  } as unknown as IntentServiceDeps;
  return { svc: new IntentService(deps), github };
}

describe('IntentService.firstLinkedIssue', () => {
  const issue = { number: 12, title: 'T', body: 'B', state: 'open' };

  it('fetches the first same-repo ref in text order', async () => {
    const getIssue = vi.fn(async () => issue);
    const { svc } = makeService(`closes #12 and ${URL13}`, getIssue);
    expect(await svc.firstLinkedIssue('ws', 'p1')).toEqual({ status: 'ok', issue });
    expect(getIssue).toHaveBeenCalledWith({ owner: 'acme', name: 'payments-api' }, 12);
  });

  it('takes #13 when the URL comes before #12', async () => {
    const getIssue = vi.fn(async () => issue);
    await makeService(`${URL13} and #12`, getIssue).svc.firstLinkedIssue('ws', 'p1');
    expect(getIssue).toHaveBeenCalledWith(expect.anything(), 13);
  });

  it('skips a cross-repo ref before #5', async () => {
    const getIssue = vi.fn(async () => issue);
    await makeService('other/repo#9 then #5', getIssue).svc.firstLinkedIssue('ws', 'p1');
    expect(getIssue).toHaveBeenCalledTimes(1);
    expect(getIssue).toHaveBeenCalledWith(expect.anything(), 5);
  });

  it('is missing (no GitHub call) when every ref is cross-repo', async () => {
    const getIssue = vi.fn(async () => issue);
    const { svc, github } = makeService('other/repo#9', getIssue);
    expect(await svc.firstLinkedIssue('ws', 'p1')).toEqual({ status: 'missing', reason: 'issue in another repository' });
    expect(github).not.toHaveBeenCalled();
  });

  it('is missing when there is no ref or no body', async () => {
    const getIssue = vi.fn(async () => issue);
    expect(await makeService('nothing here', getIssue).svc.firstLinkedIssue('ws', 'p1')).toEqual({
      status: 'missing',
      reason: 'no issue referenced',
    });
    expect((await makeService(null, getIssue).svc.firstLinkedIssue('ws', 'p1')).status).toBe('missing');
    expect(getIssue).not.toHaveBeenCalled();
  });

  it('is missing with a redacted reason when GitHub throws', async () => {
    const { svc } = makeService('#12', async () => {
      throw Object.assign(new Error('token ghp_SECRET leaked'), { status: 404 });
    });
    const res = await svc.firstLinkedIssue('ws', 'p1');
    expect(res).toEqual({ status: 'missing', reason: 'not found' });
  });

  it('is workspace-scoped: another workspace gets NotFoundError', async () => {
    const { svc } = makeService('#12', async () => issue);
    await expect(svc.firstLinkedIssue('other', 'p1')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('Container.prBlast', () => {
  it('builds a BlastService that logs through the logger it is given', async () => {
    const rows = (r: unknown[]) => {
      const chain: Record<string, unknown> = {};
      for (const k of ['from', 'innerJoin', 'where']) chain[k] = () => chain;
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(r).then(res);
      return chain;
    };
    const pull = { prId: 'p1', number: 1, repoId: 'r1', repoFullName: 'a/b', base: 'main', headSha: 'abc' };
    const results = [[pull], [{ path: 'src/a.ts' }]];
    const db = { select: () => rows(results.shift()!) } as unknown as Db;
    const repoIntel = {
      getIndexState: async () => ({ status: 'ready' }),
      getBlastRadius: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [] }),
    } as unknown as RepoIntel;
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const container = new Container(config, db, { repoIntel });
    const log = { info: vi.fn() };
    await container.prBlast(log).getBlast('ws', 'p1');
    expect(log.info).toHaveBeenCalledTimes(1);
  });
});
