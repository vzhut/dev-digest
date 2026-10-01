import { describe, it, expect } from 'vitest';
import type { TourFacts, TourUsage } from '@devdigest/shared';
import {
  buildSkeleton,
  classifyIndex,
  formatGeneratedLog,
  mergeModelOutput,
  redactDetail,
  toLastAttempt,
  type PathKinds,
} from '../src/modules/onboarding/helpers.js';
import type { OnboardingLlmOutput } from '../src/modules/onboarding/output-schema.js';
import { redactSecrets } from '../src/modules/_shared/redact.js';
import { redactSecrets as intentRedact } from '../src/modules/intent/helpers.js';

const facts: TourFacts = {
  source_sha: 'abc1234',
  index: {
    status: 'ready',
    reason: null,
    files_indexed: 10,
    files_skipped: 1,
    files_total: 11,
    bounded: false,
    hotness_available: true,
    usable: true,
    unusable_reason: null,
    last_indexed_sha: 'abc1234',
  },
  stack: [{ name: 'TypeScript', evidence_path: 'tsconfig.json' }],
  structure: [{ path: 'src', files: 9 }],
  routes: [{ method: 'GET', path: '/a', file: 'src/a.ts' }],
  run_locally: [
    { command: 'pnpm install', source_path: 'package.json' },
    { command: 'pnpm dev', source_path: 'package.json' },
  ],
  critical_paths: [
    { path: 'src/a.ts', computed_reason: 'imported by 3 files · rank p99' },
    { path: 'src/b.ts', computed_reason: 'imported by 2 files · rank p80' },
  ],
  reading_path: [
    { path: 'src/a.ts', score: 0.9, pagerank: 0.5, hotness: 0.8, computed_reason: 'imported by 3 files · rank p99' },
    { path: 'src/b.ts', score: 0.5, pagerank: 0.4, hotness: 0.2, computed_reason: 'imported by 2 files · rank p80' },
  ],
  readme: null,
};

const kinds: PathKinds = new Map([
  ['src/a.ts', 'file'],
  ['src/b.ts', 'file'],
  ['src', 'dir'],
]);

const output = (over: Partial<OnboardingLlmOutput> = {}): OnboardingLlmOutput => ({
  architecture_summary_md: 'A summary.',
  architecture_diagram: 'flowchart LR\n A-->B',
  critical_path_reasons: [{ path: 'src/a.ts', reason: 'core' }],
  reading_path_whys: [{ path: 'src/a.ts', why: 'start here' }],
  command_notes: [{ command: 'pnpm dev', note: 'needs postgres' }],
  first_tasks: [{ title: 'Add a test', path: 'src/a.ts', complexity: 'low' }],
  ...over,
});

describe('mergeModelOutput', () => {
  it('keeps the computed order and drops an extra / reordered file (AC-16)', () => {
    const m = mergeModelOutput(
      facts,
      output({
        reading_path_whys: [
          { path: 'src/b.ts', why: 'second' },
          { path: 'src/zzz.ts', why: 'extra' },
          { path: 'src/a.ts', why: 'first' },
        ],
      }),
      kinds,
    );
    expect(m.reading_path.map((r) => [r.path, r.why])).toEqual([
      ['src/a.ts', 'first'],
      ['src/b.ts', 'second'],
    ]);
    expect(m.reading_path[0]).toMatchObject({ score: 0.9, computed_reason: 'imported by 3 files · rank p99' });
    expect(m.reading_path.some((r) => r.path === 'src/zzz.ts')).toBe(false);
    expect(m.critical_paths[1]).toEqual({ path: 'src/b.ts', reason: null, computed_reason: 'imported by 2 files · rank p80' });
  });

  it('drops a hallucinated task and an invented command, counting both (AC-17)', () => {
    const m = mergeModelOutput(
      facts,
      output({
        command_notes: [{ command: 'rm -rf /', note: 'cleanup' }],
        first_tasks: [
          { title: 'Real', path: 'src/', complexity: 'medium' },
          { title: 'Ghost', path: 'src/missing.ts', complexity: 'low' },
        ],
      }),
      kinds,
    );
    expect(m.dropped_items).toBe(2);
    expect(m.run_locally.every((c) => c.note === null)).toBe(true);
    expect(m.first_tasks).toEqual([{ title: 'Real', path: 'src', path_kind: 'dir', complexity: 'medium' }]);
  });

  it('keeps an empty first_tasks list when every task is dropped', () => {
    const m = mergeModelOutput(facts, output({ first_tasks: [{ title: 'x', path: 'nope', complexity: 'low' }] }), kinds);
    expect(m.first_tasks).toEqual([]);
    expect(m.dropped_items).toBe(1);
    expect(m.architecture.summary_md).toBe('A summary.');
  });

  it('caps first tasks at 5 and normalises the diagram fence', () => {
    const tasks = Array.from({ length: 7 }, (_, i) => ({ title: `t${i}`, path: 'src/a.ts', complexity: 'low' as const }));
    const m = mergeModelOutput(facts, output({ first_tasks: tasks, architecture_diagram: '```mermaid\nflowchart LR\n A-->B\n```' }), kinds);
    expect(m.first_tasks).toHaveLength(5);
    expect(m.dropped_items).toBe(2);
    expect(m.architecture.diagram).toBe('flowchart LR\n A-->B');
  });
});

describe('buildSkeleton', () => {
  it('contains only deterministic content', () => {
    expect(buildSkeleton(facts, 'index_degraded', 'status=degraded')).toEqual({
      mode: 'skeleton',
      skeleton_reason: 'index_degraded',
      skeleton_detail: 'status=degraded',
      index: {
        status: 'ready',
        reason: null,
        files_indexed: 10,
        files_skipped: 1,
        files_total: 11,
        bounded: false,
        hotness_available: true,
      },
      architecture: { summary_md: null, diagram: null, stack: facts.stack, structure: facts.structure, routes: facts.routes },
      critical_paths: [
        { path: 'src/a.ts', reason: null, computed_reason: 'imported by 3 files · rank p99' },
        { path: 'src/b.ts', reason: null, computed_reason: 'imported by 2 files · rank p80' },
      ],
      run_locally: [
        { command: 'pnpm install', source_path: 'package.json', note: null },
        { command: 'pnpm dev', source_path: 'package.json', note: null },
      ],
      reading_path: facts.reading_path.map((r) => ({ ...r, why: null })),
      first_tasks: [],
    });
  });

  it('redacts the failure detail', () => {
    const s = buildSkeleton(facts, 'llm_failed', 'provider said Bearer sk-or-v1-abcdefghijklmnop0123');
    expect(s.skeleton_detail).not.toContain('abcdefghij');
  });
});

describe('classifyIndex', () => {
  const ok = { flagEnabled: true, status: 'ready', rankedFiles: 5, indexedSha: 'abc', shaInClone: true };
  it('covers the five unusable cases plus sha_missing and usable', () => {
    expect(classifyIndex({ ...ok, flagEnabled: false }).unusable_reason).toBe('flag_off');
    expect(classifyIndex({ ...ok, status: null }).unusable_reason).toBe('no_data');
    expect(classifyIndex({ ...ok, status: 'failed' }).unusable_reason).toBe('failed');
    expect(classifyIndex({ ...ok, status: 'degraded' }).unusable_reason).toBe('degraded');
    expect(classifyIndex({ ...ok, rankedFiles: 0 }).unusable_reason).toBe('no_ranked_files');
    expect(classifyIndex({ ...ok, shaInClone: false }).unusable_reason).toBe('sha_missing');
    expect(classifyIndex({ ...ok, indexedSha: '' }).unusable_reason).toBe('sha_missing');
    expect(classifyIndex(ok)).toEqual({ usable: true, unusable_reason: null });
  });
});

describe('formatGeneratedLog / toLastAttempt', () => {
  const usage: TourUsage = { llm_calls: 1, tokens_in: 8000, tokens_out: 1119, cost_usd: 0.0012, model: 'openrouter/x/y', duration_ms: 4200, dropped_items: 2 };
  it('writes the exact AC-28 line', () => {
    expect(formatGeneratedLog({ owner: 'acme', name: 'app', mode: 'llm', skeletonReason: null, usage })).toBe(
      'onboarding: generated acme/app mode=llm reason=none llm_calls=1 tokens=8000/1119 cost=$0.001200 model=openrouter/x/y duration_ms=4200 dropped=2',
    );
    expect(
      formatGeneratedLog({
        owner: 'acme',
        name: 'app',
        mode: 'skeleton',
        skeletonReason: 'index_degraded',
        usage: { llm_calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: null, model: null, duration_ms: 5, dropped_items: 0 },
      }),
    ).toBe('onboarding: generated acme/app mode=skeleton reason=index_degraded llm_calls=0 tokens=0/0 cost=unknown model=none duration_ms=5 dropped=0');
  });

  it('builds a redacted last attempt', () => {
    const la = toLastAttempt('2026-10-01T00:00:00Z', 'llm_failed', 'x-access-token:ghp_secret@host', usage);
    expect(la.detail).not.toContain('ghp_secret');
    expect(la).toMatchObject({ at: '2026-10-01T00:00:00Z', skeleton_reason: 'llm_failed', usage });
    expect(toLastAttempt('t', 'llm_failed', null, usage).detail).toBeNull();
  });
});

describe('redaction', () => {
  it('removes keys and stays single-line', () => {
    const out = redactDetail('401 for Bearer sk-or-v1-0123456789abcdef\napi_key=hunter2hunter2 and more');
    expect(out).not.toContain('0123456789abcdef');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('\n');
  });

  it('is the same function the intent module exports', () => {
    expect(intentRedact).toBe(redactSecrets);
  });
});
