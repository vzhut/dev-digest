import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BlastRadius, LLMProvider, PrBrief, PrIntentRecord, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { BriefService, type BriefServiceDeps, type BriefLinkedIssue } from '../src/modules/brief/service.js';
import { ConfigError } from '../src/platform/errors.js';
import { FsProjectDocs } from '../src/adapters/project-docs/fs.js';

/**
 * Hermetic: the service only sees injected functions. `llm(provider)` hands out the
 * capturing fake for openrouter and FAILS FAST for every other provider, so a machine
 * holding a real API key can never turn this suite into a paid call.
 */
const WS = 'ws-1';
const PR = 'pr-1';
const SECRET = 'sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef';

const OUTPUT = {
  summary: 'Adds a rate limiter.',
  risks: [
    { kind: 'security', title: 'Bypass', explanation: 'Header spoof.', severity: 'high', file_refs: ['src/a.ts:3-9', 'nope.ts'] },
    { kind: 'perf', title: 'Invented', explanation: 'x', severity: 'low', file_refs: ['ghost.ts'] },
  ],
  review_focus: [{ file: 'src/a.ts', line: 3, reason: 'Check the limiter.' }],
};

type Behaviour = (req: StructuredRequest<unknown>) => Promise<StructuredResult<unknown>>;

class FakeLlm implements LLMProvider {
  readonly id = 'openrouter' as unknown as LLMProvider['id'];
  calls: StructuredRequest<unknown>[] = [];
  constructor(private behaviour: Behaviour) {}
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('unexpected complete()');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(req as StructuredRequest<unknown>);
    return (await this.behaviour(req as StructuredRequest<unknown>)) as StructuredResult<T>;
  }
  async embed(): Promise<number[][]> {
    throw new Error('unexpected embed()');
  }
}

const ok = (data: unknown = OUTPUT): Behaviour => async (req) => ({
  data,
  model: req.model,
  tokensIn: 900,
  tokensOut: 120,
  costUsd: 0.004,
  raw: '',
  attempts: 1,
});

const PATCH = '@@ -1,2 +1,3 @@ SENTINEL_CTX\n+SENTINEL_CODE = 1\n line';
const FILES = [
  { path: 'src/a.ts', additions: 3, deletions: 1, patch: PATCH },
  { path: 'src/b.ts', additions: 1, deletions: 0, patch: null },
];

const INTENT: PrIntentRecord = {
  intent: 'Add rate limiting.',
  in_scope: ['limiter'],
  out_of_scope: [],
  risk_areas: null,
  pr_id: PR,
  head_sha: 'h1',
  stale: false,
  confidence: 'high',
  sources: [],
  missing_context: [],
  provider: null,
  model: null,
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
  duration_ms: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
} as PrIntentRecord;

const BLAST: BlastRadius = {
  changed_symbols: [],
  downstream: [],
  summary: 'No downstream callers.',
} as BlastRadius;

function memRepo(opts: { files?: typeof FILES; stored?: PrBrief | null; body?: string | null; docPaths?: string[]; clonePath?: string | null; foreign?: boolean } = {}) {
  let stored: PrBrief | null = opts.stored ?? null;
  const calls = { save: 0 };
  const repo: BriefServiceDeps['repo'] = {
    findPull: async (ws: string, id: string) =>
      opts.foreign || ws !== WS || id !== PR
        ? undefined
        : ({
            pull: { id: PR, number: 7, title: 'Add limiter', headSha: 'h2', body: opts.body === undefined ? 'Adds a limiter.' : opts.body },
            repo: { owner: 'acme', name: 'api', clonePath: opts.clonePath === undefined ? '/clones/acme-api' : opts.clonePath },
          } as never),
    getFiles: async () => opts.files ?? FILES,
    getBrief: async () => stored,
    saveBrief: async (_id: string, b: PrBrief) => {
      calls.save += 1;
      stored = b;
    },
    attachedDocPaths: async () => opts.docPaths ?? [],
  };
  return { repo, calls, get stored() { return stored; } };
}

function setup(over: {
  llm?: FakeLlm;
  mem?: ReturnType<typeof memRepo>;
  intent?: () => Promise<PrIntentRecord | null>;
  blast?: () => Promise<BlastRadius>;
  issue?: () => Promise<BriefLinkedIssue>;
  docs?: BriefServiceDeps['docs'];
  resolveError?: Error;
  resolveModel?: BriefServiceDeps['resolveModel'];
  llmTimeoutMs?: number;
} = {}) {
  const llm = over.llm ?? new FakeLlm(ok());
  const mem = over.mem ?? memRepo();
  const logs: { obj: unknown; msg?: string }[] = [];
  const sink = (obj: unknown, msg?: string) => void logs.push({ obj, msg });
  const getLlm = vi.fn(async (provider: string) => {
    if (over.resolveError) throw over.resolveError;
    if (provider !== 'openrouter') throw new Error(`fail-fast: provider ${provider} must not be reached`);
    return llm;
  });
  const service = new BriefService({
    repo: mem.repo,
    intent: over.intent ?? (async () => INTENT),
    linkedIssue: over.issue ?? (async () => ({ status: 'missing', reason: 'No issue is referenced' })),
    blast: over.blast ?? (async () => BLAST),
    docs: over.docs ?? { exists: async () => true, read: async () => ({ status: 'missing', reason: 'not found' }) },
    llm: getLlm as never,
    resolveModel: over.resolveModel ?? (async () => ({ provider: 'openrouter', model: 'm-1' })),
    tokenizer: { count: (t: string) => Math.ceil(t.length / 4) },
    log: { info: sink, warn: sink, error: sink, debug: sink },
    llmTimeoutMs: over.llmTimeoutMs,
  } as BriefServiceDeps);
  return { service, llm, mem, logs, getLlm };
}

const userText = (llm: FakeLlm) => llm.calls[0]!.messages.map((m) => m.content).join('\n');

describe('BriefService', () => {
  afterEach(() => vi.useRealTimers());

  it('generate: one single-attempt call, grounded brief stored; GET afterwards makes no call and reports staleness', async () => {
    const { service, llm, mem } = setup();
    const res = await service.generate(WS, PR, { correlationId: 'req-1' });

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]).toMatchObject({ model: 'm-1', singleAttempt: true, maxRetries: 0, timeoutMs: 90_000, requireParameters: true });
    expect(res.status).toBe('ready');
    expect(res.stale).toBe(false);
    expect(res.brief).toMatchObject({
      intent: null,
      blast: null,
      history: null,
      head_sha: 'h2',
      model: 'openrouter/m-1',
      usage: { llm_calls: 1, tokens_in: 900, tokens_out: 120, cost_usd: 0.004 },
      // 'nope.ts' ref removed from the kept risk, the 'ghost.ts' risk dropped whole
      dropped_items: 2,
    });
    expect(res.brief!.risks!.risks).toHaveLength(1);
    expect(res.brief!.risks!.risks[0]!.file_refs).toEqual(['src/a.ts:3-9']);
    expect(mem.calls.save).toBe(1);

    const got = await service.get(WS, PR);
    expect(got).toMatchObject({ status: 'ready', stale: false });
    expect(llm.calls).toHaveLength(1);

    // a stored brief of an older head is stale, still without any call
    const old = setup({ mem: memRepo({ stored: { ...res.brief!, head_sha: 'old' } }) });
    expect(await old.service.get(WS, PR)).toMatchObject({ status: 'ready', stale: true });
    expect(old.llm.calls).toHaveLength(0);
    expect(await setup().service.get(WS, PR)).toEqual({ status: 'none', stale: false, brief: null });
  });

  it('404 for an unknown or foreign PR; 409 no_changes for 0 files, both before any LLM work', async () => {
    const a = setup({ mem: memRepo({ foreign: true }) });
    await expect(a.service.generate(WS, PR)).rejects.toMatchObject({ statusCode: 404 });
    await expect(a.service.get(WS, PR)).rejects.toMatchObject({ statusCode: 404 });
    const b = setup({ mem: memRepo({ files: [] }) });
    await expect(b.service.generate(WS, PR)).rejects.toMatchObject({ statusCode: 409, code: 'no_changes' });
    expect(a.getLlm).not.toHaveBeenCalled();
    expect(b.getLlm).not.toHaveBeenCalled();
  });

  it('concurrent generations make one call; the second gets 409 and GET reports generating', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const llm = new FakeLlm(async (req) => {
      await gate;
      return ok()(req);
    });
    const { service } = setup({ llm });
    const first = service.generate(WS, PR);
    await vi.waitFor(() => expect(llm.calls).toHaveLength(1));
    await expect(service.generate(WS, PR)).rejects.toMatchObject({ statusCode: 409, code: 'generation_in_progress' });
    expect((await service.get(WS, PR)).status).toBe('generating');
    release();
    await first;
    expect(llm.calls).toHaveLength(1);
    expect((await service.get(WS, PR)).status).toBe('ready');
  });

  it('a throwing, an invalid and an out-of-bounds model output each cost one call, keep the previous brief, return 502 and never leak a key', async () => {
    const previous = (await setup().service.generate(WS, PR)).brief!;
    const cases: Behaviour[] = [
      async () => {
        throw new Error(`upstream 500 for key ${SECRET}`);
      },
      ok({ nonsense: true }),
      ok({ ...OUTPUT, summary: 'x'.repeat(601) }),
    ];
    for (const behaviour of cases) {
      const llm = new FakeLlm(behaviour);
      const mem = memRepo({ stored: previous });
      const { service, logs } = setup({ llm, mem });
      const err = await service.generate(WS, PR).then(
        () => null,
        (e: Error & { statusCode?: number; code?: string }) => e,
      );
      expect(err).toMatchObject({ statusCode: 502, code: 'brief_generation_failed' });
      expect(llm.calls).toHaveLength(1);
      expect(mem.calls.save).toBe(0);
      expect(mem.stored).toBe(previous);
      expect(JSON.stringify([err!.message, logs])).not.toContain(SECRET);
      // the in-flight flag is released
      expect((await service.get(WS, PR)).status).toBe('ready');
    }
  });

  it('a hung provider is abandoned by the backstop timeout', async () => {
    const llm = new FakeLlm(() => new Promise(() => {}));
    const { service } = setup({ llm, llmTimeoutMs: 20 });
    await expect(service.generate(WS, PR)).rejects.toMatchObject({ statusCode: 502, code: 'brief_generation_failed' });
    expect(llm.calls).toHaveLength(1);
  });

  it('no key (ConfigError) → 400 config_error with 0 calls; the non-default feature model is used', async () => {
    const none = setup({ resolveError: new ConfigError(`missing OPENROUTER_API_KEY ${SECRET}`) });
    const err = await none.service.generate(WS, PR).then(() => null, (e: Error & { statusCode?: number }) => e);
    expect(err).toMatchObject({ statusCode: 400, code: 'config_error' });
    expect(err!.message).not.toContain(SECRET);
    expect(none.llm.calls).toHaveLength(0);

    const resolveModel = vi.fn(async () => ({ provider: 'openrouter' as const, model: 'custom/model-x' }));
    const custom = setup({ resolveModel });
    const res = await custom.service.generate(WS, PR);
    expect(resolveModel).toHaveBeenCalledWith(WS, 'risk_brief');
    expect(custom.llm.calls[0]!.model).toBe('custom/model-x');
    expect(res.brief!.model).toBe('openrouter/custom/model-x');
  });

  it('AC-10: the model sees hunk numbers only, never patch text or the hunk-header context', async () => {
    const { service, llm } = setup();
    await service.generate(WS, PR);
    expect(llm.calls).toHaveLength(1);
    const text = userText(llm);
    expect(text).not.toContain('SENTINEL_CODE');
    expect(text).not.toContain('SENTINEL_CTX');
    expect(text).toContain('src/a.ts');
    expect(text).toContain('1-3');
  });

  it('linked issue reaches the prompt; a lookup error becomes a missing input', async () => {
    const withIssue = setup({ issue: async () => ({ status: 'ok', issue: { title: 'Issue #12 title', body: 'Issue body text' } }) });
    const r1 = await withIssue.service.generate(WS, PR);
    expect(userText(withIssue.llm)).toContain('Issue #12 title');
    expect(r1.brief!.inputs!.missing.map((m) => m.input)).not.toContain('linked_issue');

    const failing = setup({
      issue: async () => {
        throw new Error('GitHub 502');
      },
    });
    const r2 = await failing.service.generate(WS, PR);
    expect(failing.llm.calls).toHaveLength(1);
    expect(r2.brief!.inputs!.missing).toContainEqual({ input: 'linked_issue', reason: expect.stringContaining('GitHub 502') });
  });

  it('missing intent / blast / description / stale intent / partial blast are recorded, fail-soft, with one call', async () => {
    const none = setup({
      mem: memRepo({ body: '   ' }),
      intent: async () => null,
      blast: async () => {
        throw new Error('index offline');
      },
    });
    const r = await none.service.generate(WS, PR);
    expect(none.llm.calls).toHaveLength(1);
    const kinds = r.brief!.inputs!.missing.map((m) => m.input);
    expect(kinds).toEqual(expect.arrayContaining(['description', 'intent', 'blast', 'linked_issue']));
    expect(r.brief!.inputs!.missing.find((m) => m.input === 'blast')!.reason).toBe('blast radius unavailable: index offline');

    const soft = setup({
      intent: async () => ({ ...INTENT, stale: true }),
      blast: async () => ({ ...BLAST, degraded: true }),
    });
    const r2 = await soft.service.generate(WS, PR);
    expect(r2.brief!.inputs!.notes).toEqual(expect.arrayContaining(['intent may be outdated', 'blast radius partial']));
  });

  it('AC-12: attached docs are read in order, unreadable ones are skipped, a missing clone is noted', async () => {
    const present: Record<string, string> = { 'a.md': 'DOC-A', 'shared.md': 'DOC-SHARED', 's1.md': 'DOC-S1', 'b.md': 'DOC-B' };
    const docs: BriefServiceDeps['docs'] = {
      exists: async () => true,
      read: async (_dir: string, p: string) =>
        present[p] !== undefined ? { status: 'ok', text: present[p]!, bytes: present[p]!.length } : { status: 'missing', reason: 'not found' },
    };
    const { service, llm } = setup({ docs, mem: memRepo({ docPaths: ['a.md', 'shared.md', 's1.md', 'b.md', 'missing.md'] }) });
    const r = await service.generate(WS, PR);
    const text = userText(llm);
    const order = ['DOC-A', 'DOC-SHARED', 'DOC-S1', 'DOC-B'].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(r.brief!.inputs!.skipped).toEqual(['missing.md']);

    const noClone = setup({ mem: memRepo({ docPaths: ['a.md'], clonePath: null }) });
    const r2 = await noClone.service.generate(WS, PR);
    expect(r2.brief!.inputs!.notes).toContain('repository not cloned');
    expect(r2.brief!.inputs!.skipped).toEqual(['a.md']);

    const noDocs = await setup().service.generate(WS, PR);
    expect(noDocs.brief!.inputs!.missing.map((m) => m.input)).toContain('specs');
  });

  describe('real project-docs reader', () => {
    let dir: string;
    let outside: string;
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    });

    it('a symlink pointing outside the clone is skipped and its content never reaches the prompt', async () => {
      dir = await mkdtemp(join(tmpdir(), 'brief-clone-'));
      outside = await mkdtemp(join(tmpdir(), 'brief-outside-'));
      await writeFile(join(outside, 'secret.md'), 'OUTSIDE-SECRET-TEXT');
      await mkdir(join(dir, 'docs'));
      await writeFile(join(dir, 'docs', 'ok.md'), 'INSIDE-OK-TEXT');
      await symlink(join(outside, 'secret.md'), join(dir, 'docs', 'link.md'));

      const { service, llm } = setup({
        docs: new FsProjectDocs(),
        mem: memRepo({ docPaths: ['docs/ok.md', 'docs/link.md'], clonePath: dir }),
      });
      const r = await service.generate(WS, PR);
      const text = userText(llm);
      expect(text).toContain('INSIDE-OK-TEXT');
      expect(text).not.toContain('OUTSIDE-SECRET-TEXT');
      expect(r.brief!.inputs!.skipped).toEqual(['docs/link.md']);
    });
  });

  it('logs one prompt.assembled event without description text and one "/12000" result line', async () => {
    const { service, logs } = setup({ mem: memRepo({ body: 'DESCRIPTION-SENTINEL-TEXT' }) });
    await service.generate(WS, PR, { correlationId: 'req-9' });
    const assembled = logs.filter((l) => (l.obj as { event?: string }).event === 'prompt.assembled');
    expect(assembled).toHaveLength(1);
    expect(assembled[0]!.obj).toMatchObject({ call: 'risk_brief', model: 'openrouter/m-1', correlation_id: 'req-9' });
    expect(JSON.stringify(logs)).not.toContain('DESCRIPTION-SENTINEL-TEXT');
    const lines = logs.filter((l) => typeof l.msg === 'string' && l.msg.startsWith('brief: generated'));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.msg).toMatch(/input_tokens=\d+\/12000 /);
    expect(lines[0]!.msg).toContain('ok=true llm_calls=1');
  });
});
