import { describe, it, expect } from 'vitest';
import { FINDING_PREVIEW_SUMMARY_MAX } from '@devdigest/shared';
import { previewSummary } from '../src/modules/_shared/finding-previews.js';

/** The popover shows a short, bounded description — never the whole rationale. */
describe('previewSummary', () => {
  it('keeps a short rationale untouched', () => {
    expect(previewSummary('A live Stripe key is committed.')).toBe('A live Stripe key is committed.');
  });

  it('keeps a rationale of exactly the max length untouched', () => {
    const exact = 'x'.repeat(FINDING_PREVIEW_SUMMARY_MAX);
    expect(previewSummary(exact)).toBe(exact);
  });

  it('cuts a long rationale to the max length and marks the cut', () => {
    const out = previewSummary('y'.repeat(FINDING_PREVIEW_SUMMARY_MAX + 50));
    expect(out).toBe(`${'y'.repeat(FINDING_PREVIEW_SUMMARY_MAX)}…`);
  });
});
