import { describe, it, expect } from 'vitest';
import type { IntentSource } from '@devdigest/shared';
import { computeIntentConfidence, meaningfulChars } from '../src/index.js';

const src = (kind: IntentSource['kind'], status: IntentSource['status']): IntentSource => ({
  kind,
  ref: 'r',
  status,
  chars: 1,
});

describe('computeIntentConfidence', () => {
  it('low when the description is under 40 chars, even with a loaded issue', () => {
    expect(computeIntentConfidence([src('github_issue', 'used')], 39)).toBe('low');
    expect(computeIntentConfidence([], 0)).toBe('low');
  });

  it('low when linked sources were referenced but none loaded', () => {
    expect(computeIntentConfidence([src('github_issue', 'missing'), src('repo_file', 'blocked')], 200)).toBe('low');
  });

  it('low when nothing linked loaded and the description is thin (under 200 chars)', () => {
    // the PR #482 case: a one-sentence description, no links, so no scope judgement is supportable
    expect(computeIntentConfidence([src('pr_description', 'used'), src('file_list', 'used')], 88)).toBe('low');
    expect(computeIntentConfidence([src('pr_description', 'used')], 199)).toBe('low');
    // a loaded linked source lifts the thin-description floor
    expect(computeIntentConfidence([src('github_issue', 'used'), src('pr_description', 'used')], 88)).toBe('high');
  });

  it('high with a long description, a loaded linked source and nothing missing', () => {
    expect(computeIntentConfidence([src('github_issue', 'used'), src('pr_title', 'used')], 40)).toBe('high');
    expect(computeIntentConfidence([src('repo_file', 'truncated')], 500)).toBe('high');
  });

  it('medium otherwise: no links, or a mix of loaded and missing', () => {
    expect(computeIntentConfidence([src('pr_description', 'used')], 200)).toBe('medium');
    expect(computeIntentConfidence([src('github_issue', 'used'), src('repo_file', 'missing')], 200)).toBe('medium');
    // an unloaded non-linked source (file list) blocks "high" but is not "low"
    expect(computeIntentConfidence([src('github_issue', 'used'), src('file_list', 'missing')], 200)).toBe('medium');
  });

  it('meaningfulChars collapses whitespace', () => {
    expect(meaningfulChars('  a \n\n  b  ')).toBe(3);
  });
});
