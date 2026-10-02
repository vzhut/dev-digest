import { describe, it, expect } from 'vitest';
import { Tour, OnboardingTourResponse, TourFacts } from '@devdigest/shared';

const usage = {
  llm_calls: 1 as const,
  tokens_in: 8000,
  tokens_out: 1119,
  cost_usd: 0.0123,
  model: 'm',
  duration_ms: 4200,
  dropped_items: 0,
};
const index = {
  status: 'full',
  reason: null,
  files_indexed: 120,
  files_skipped: 3,
  files_total: 123,
  bounded: false,
  hotness_available: true,
};

const llmTour = {
  repo_id: 'r1',
  generated_at: '2026-10-01T10:00:00.000Z',
  source_sha: 'abc123',
  mode: 'llm' as const,
  skeleton_reason: null,
  skeleton_detail: null,
  index,
  usage,
  architecture: {
    summary_md: '# Summary',
    diagram: 'graph TD; A-->B',
    stack: [{ name: 'Fastify', evidence_path: 'server/package.json' }],
    structure: [{ path: 'server', files: 80 }],
    routes: [{ method: 'GET', path: '/repos', file: 'server/src/routes.ts' }],
  },
  critical_paths: [{ path: 'a.ts', reason: 'core', computed_reason: 'imported by 4 files' }],
  run_locally: [{ command: 'pnpm dev', source_path: 'package.json', note: null }],
  reading_path: [
    { path: 'a.ts', score: 0.9, pagerank: 0.5, hotness: 0.4, why: 'entry', computed_reason: 'rank p99' },
  ],
  first_tasks: [{ title: 'Add a test', path: 'a.ts', path_kind: 'file' as const, complexity: 'low' as const }],
  last_attempt: null,
};

describe('onboarding tour contracts', () => {
  it('parses a full llm tour, a skeleton tour and a tour with no last_attempt key', () => {
    expect(Tour.parse(llmTour).mode).toBe('llm');

    const skeleton = {
      ...llmTour,
      mode: 'skeleton' as const,
      skeleton_reason: 'llm_unavailable' as const,
      skeleton_detail: 'no key',
      usage: { ...usage, llm_calls: 0 as const, tokens_in: 0, tokens_out: 0, cost_usd: null, model: null },
      architecture: { ...llmTour.architecture, summary_md: null, diagram: null },
      last_attempt: {
        at: '2026-10-01T10:01:00.000Z',
        skeleton_reason: 'llm_failed' as const,
        detail: null,
        usage,
      },
    };
    expect(Tour.parse(skeleton).last_attempt?.skeleton_reason).toBe('llm_failed');

    // Documents persisted before `last_attempt` existed have no such key.
    const { last_attempt: _omit, ...legacy } = llmTour;
    expect(Tour.parse(legacy).last_attempt).toBeUndefined();

    expect(() => Tour.parse({ ...llmTour, mode: 'other' })).toThrow();
  });

  it('parses a response for each status', () => {
    for (const status of ['none', 'not_cloned'] as const) {
      expect(OnboardingTourResponse.parse({ status, index_sha: null }).tour).toBeUndefined();
    }
    for (const status of ['ready', 'generating'] as const) {
      const r = OnboardingTourResponse.parse({ status, tour: llmTour, index_sha: 'abc123' });
      expect(r.tour?.repo_id).toBe('r1');
    }
    expect(() => OnboardingTourResponse.parse({ status: 'bogus', index_sha: null })).toThrow();
  });

  it('parses TourFacts including the sha_missing unusable reason', () => {
    const facts = {
      source_sha: 'abc123',
      index: { ...index, usable: false, unusable_reason: 'sha_missing' as const, last_indexed_sha: 'zzz' },
      stack: [],
      structure: [],
      routes: [],
      run_locally: [{ command: 'pnpm dev', source_path: 'package.json' }],
      critical_paths: [{ path: 'a.ts', computed_reason: 'imported by 4 files' }],
      reading_path: [{ path: 'a.ts', score: 1, pagerank: 0.5, hotness: 0, computed_reason: 'rank p99' }],
      readme: null,
    };
    expect(TourFacts.parse(facts).index.unusable_reason).toBe('sha_missing');
    expect(() =>
      TourFacts.parse({ ...facts, index: { ...facts.index, unusable_reason: 'nope' } }),
    ).toThrow();
  });
});
