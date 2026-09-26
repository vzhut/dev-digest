/**
 * Prompt log — what the prompt builder reports about an assembled prompt.
 * The contract under test: section names, sources and SIZES only. The text of
 * the diff, specs, PR body, skills, memory, callers or repo map never appears.
 */
import { describe, it, expect } from 'vitest';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { assemblePrompt, reviewPullRequest } from '../src/index.js';

// Distinctive markers: if any of these shows up in a log payload, content leaked.
const SECRET = {
  diff: 'DIFF-BODY-MARKER-91',
  spec: 'SPEC-PRIVATE-MARKER-52',
  body: 'PR-BODY-MARKER-17',
  skill: 'SKILL-BODY-MARKER-33',
  memory: 'MEMORY-MARKER-08',
  callers: 'CALLERS-MARKER-64',
  repoMap: 'REPOMAP-MARKER-75',
};

const parts = {
  system: 'AGENT-SYSTEM',
  diff: SECRET.diff,
  specs: [SECRET.spec],
  prDescription: SECRET.body,
  skills: [{ name: 's', body: SECRET.skill, trusted: false }],
  memory: [SECRET.memory],
  callers: SECRET.callers,
  repoMap: SECRET.repoMap,
  task: "Review PR #7 'x'",
};

describe('assemblePrompt sections (prompt log metadata)', () => {
  it('lists every rendered section in send order with a source and its rendered size', () => {
    const { sections, messages } = assemblePrompt(parts);
    expect(sections.map((s) => [s.name, s.source])).toEqual([
      ['system', 'agent-prompt'],
      ['task', 'server'],
      ['pr_description', 'pr-author'],
      ['skills', 'skill-store'],
      ['memory', 'memory-store'],
      ['repo_map', 'repo-intel'],
      ['specs', 'project-specs'],
      ['callers', 'repo-intel'],
      ['diff', 'git-diff'],
    ]);
    // Sizes are the rendered lengths, so they add up to what is actually sent.
    const userChars = sections.filter((s) => s.name !== 'system').reduce((n, s) => n + s.chars, 0);
    expect(sections[0]!.chars).toBe(messages[0]!.content.length);
    // user message = sections joined by a blank line
    expect(userChars + 2 * (sections.length - 2)).toBe(messages[1]!.content.length);
  });

  it('carries no prompt text at all', () => {
    const { sections } = assemblePrompt(parts);
    const json = JSON.stringify(sections);
    for (const marker of Object.values(SECRET)) expect(json).not.toContain(marker);
    expect(json).not.toContain('AGENT-SYSTEM');
  });

  it('omits sections that are not rendered, and leaves the messages untouched', () => {
    const bare = assemblePrompt({ system: 's', diff: 'D' });
    expect(bare.sections.map((s) => s.name)).toEqual(['system', 'diff']);
    // adding the logging options must not change a single byte of the prompt
    const withLog = assemblePrompt(parts, { countTokens: (t) => t.length, detail: true });
    expect(withLog.messages).toEqual(assemblePrompt(parts).messages);
  });

  it('marks untrusted sections and reports the original size of a truncated PR body', () => {
    const { sections } = assemblePrompt({ system: 's', diff: 'D', prDescription: 'x'.repeat(9000) });
    const body = sections.find((s) => s.name === 'pr_description')!;
    expect(body.untrusted).toBe(true);
    expect(body.capped_from).toBe(9000);
    expect(sections.find((s) => s.name === 'system')!.untrusted).toBe(false);
  });

  it('adds per-section tokens only when detail is requested and a counter is injected', () => {
    const count = (t: string) => Math.ceil(t.length / 4);
    expect(assemblePrompt(parts, { countTokens: count }).sections.every((s) => s.tokens === undefined)).toBe(true);
    expect(assemblePrompt(parts, { detail: true }).sections.every((s) => s.tokens === undefined)).toBe(true);
    const detailed = assemblePrompt(parts, { countTokens: count, detail: true }).sections;
    expect(detailed.every((s) => typeof s.tokens === 'number')).toBe(true);
  });
});

describe('reviewPullRequest — prompt.assembled events', () => {
  async function run(extra: Record<string, unknown>) {
    const events: { kind: string; msg: string; data?: any }[] = [];
    const llm = new MockLLMProvider('openai', {
      structured: { verdict: 'approve', summary: 's', score: 0, findings: [] },
    });
    await reviewPullRequest({
      systemPrompt: 'AGENT-SYSTEM',
      model: 'test-model',
      diff: await new MockGitClient().diff(),
      llm,
      specs: [SECRET.spec],
      prDescription: SECRET.body,
      callers: SECRET.callers,
      repoMap: SECRET.repoMap,
      memory: [SECRET.memory],
      onEvent: (e) => events.push(e),
      ...extra,
    });
    return events;
  }

  it('emits one info event per model call with model, correlation id, sections and totals', async () => {
    const events = await run({ correlationId: 'corr-123', countTokens: (t: string) => Math.ceil(t.length / 4) });
    const e = events.find((x) => x.data?.event === 'prompt.assembled')!;
    expect(e.kind).toBe('info');
    expect(e.data).toMatchObject({ call: 'review', model: 'test-model', correlation_id: 'corr-123' });
    expect(e.data.sections.map((s: { name: string }) => s.name)).toContain('diff');
    expect(e.data.sections.every((s: { source: string }) => typeof s.source === 'string')).toBe(true);
    expect(e.data.total_chars).toBeGreaterThan(0);
    expect(e.data.est_tokens).toBeGreaterThan(0);
    // default mode: no per-section tokens, no detail event
    expect(e.data.sections.some((s: { tokens?: number }) => s.tokens !== undefined)).toBe(false);
    expect(events.some((x) => x.data?.event === 'prompt.assembled.detail')).toBe(false);
  });

  it('never puts prompt content, including the diff, into any event', async () => {
    const events = await run({ correlationId: 'c', countTokens: (t: string) => t.length, promptLogDetail: true });
    const all = JSON.stringify(events.filter((x) => String(x.data?.event ?? '').startsWith('prompt.assembled')));
    for (const marker of Object.values(SECRET)) expect(all).not.toContain(marker);
    // and none of the actual diff lines either
    const diff = await new MockGitClient().diff();
    const firstAddedLine = diff.raw.split('\n').find((l) => l.startsWith('+') && !l.startsWith('+++') && l.length > 12);
    if (firstAddedLine) expect(all).not.toContain(firstAddedLine.slice(1));
  });

  it('emits the per-section detail event (tokens, index, untrusted) only when asked', async () => {
    const events = await run({ countTokens: (t: string) => Math.ceil(t.length / 4), promptLogDetail: true });
    const d = events.find((x) => x.data?.event === 'prompt.assembled.detail')!;
    expect(d.kind).toBe('tool'); // debug level when mirrored to pino
    expect(d.data.sections[0]).toMatchObject({ index: 0, name: 'system', untrusted: false });
    expect(d.data.sections.every((s: { tokens?: number }) => typeof s.tokens === 'number')).toBe(true);
  });

  it('omits the correlation id when none is given', async () => {
    const events = await run({});
    const e = events.find((x) => x.data?.event === 'prompt.assembled')!;
    expect('correlation_id' in e.data).toBe(false);
    expect('est_tokens' in e.data).toBe(false);
  });
});
