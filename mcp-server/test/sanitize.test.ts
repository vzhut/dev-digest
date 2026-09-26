import { describe, expect, it } from 'vitest';
import { sanitizeText } from '../src/format/sanitize.js';

describe('sanitizeText', () => {
  it('strips ANSI escapes, NUL and other control characters', () => {
    expect(sanitizeText('\u001b[31mred\u001b[0m\u0000 text\u0007\u009b', 100)).toBe('red text');
    expect(sanitizeText('a\u001b]0;evil title\u0007b', 100)).toBe('ab');
  });

  it('removes invisible and bidi override characters', () => {
    expect(sanitizeText('ig​nore‮ all', 100)).toBe('ignore all');
  });

  it('collapses whitespace and trims', () => {
    expect(sanitizeText('  a \n\n\t b   c  ', 100)).toBe('a b c');
  });

  it('caps the length including the ellipsis', () => {
    const out = sanitizeText('x'.repeat(50), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith('…')).toBe(true);
    expect(sanitizeText('short', 10)).toBe('short');
  });

  it('keeps line breaks in multiline mode but not blank-line floods', () => {
    expect(sanitizeText('a  b\r\nc\n\n\n\nd', 100, { multiline: true })).toBe('a b\nc\n\nd');
  });
});
