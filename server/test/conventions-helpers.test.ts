import { describe, it, expect } from 'vitest';
import {
  applyMeasuredSupport,
  buildEvidenceUrl,
  composeSkillBody,
  computeFingerprint,
  computeMeasuredSupport,
  filterAlreadyDecided,
  numberAndCapLines,
  rankAndCapCandidates,
  selectConfigFiles,
  slugify,
  verifyCandidate,
  type FileLines,
  type ModelCandidate,
  type VerifiedCandidate,
} from '../src/modules/conventions/helpers.js';

function file(path: string, lines: string[]): [string, FileLines] {
  return [path, { path, lines }];
}

function candidate(overrides: Partial<ModelCandidate> = {}): ModelCandidate {
  return {
    category: 'style',
    rule: 'Use async/await, not .then()',
    confidence: 0.9,
    ...overrides,
    evidence: {
      path: 'src/a.ts',
      line_start: 2,
      line_end: 2,
      quote: 'await thing()',
      support_pattern: null,
      violation_pattern: null,
      ...overrides.evidence,
    },
  };
}

describe('verifyCandidate', () => {
  const files = new Map([file('src/a.ts', ['import x', 'await thing()', 'export {}'])]);

  it('accepts a clean candidate and reads the snippet from the file, not the model', () => {
    const result = verifyCandidate(candidate(), files, new Set());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidate.evidenceSnippet).toBe('await thing()');
      expect(result.candidate.evidenceLineStart).toBe(2);
      expect(result.candidate.evidenceLineEnd).toBe(2);
    }
  });

  it('drops a missing file as no_file', () => {
    const result = verifyCandidate(candidate({ evidence: { path: 'src/missing.ts', line_start: 1, line_end: 1, quote: 'x' } }), files, new Set());
    expect(result).toEqual({ ok: false, reason: 'no_file' });
  });

  it('drops ../ traversal as no_file without touching the map', () => {
    const result = verifyCandidate(candidate({ evidence: { path: '../secrets.ts', line_start: 1, line_end: 1, quote: 'x' } }), files, new Set());
    expect(result).toEqual({ ok: false, reason: 'no_file' });
  });

  it('drops an absolute path as no_file', () => {
    const result = verifyCandidate(candidate({ evidence: { path: '/etc/passwd', line_start: 1, line_end: 1, quote: 'x' } }), files, new Set());
    expect(result).toEqual({ ok: false, reason: 'no_file' });
  });

  it('drops a range past the end of the file as bad_range', () => {
    const result = verifyCandidate(candidate({ evidence: { path: 'src/a.ts', line_start: 1, line_end: 99, quote: 'import x' } }), files, new Set());
    expect(result).toEqual({ ok: false, reason: 'bad_range' });
  });

  it('drops an oversize span as bad_range', () => {
    const big = Array.from({ length: 40 }, (_, i) => `line ${i}`);
    const bigFiles = new Map([file('src/big.ts', big)]);
    const result = verifyCandidate(
      candidate({ evidence: { path: 'src/big.ts', line_start: 1, line_end: 35, quote: 'line 0' } }),
      bigFiles,
      new Set(),
    );
    expect(result).toEqual({ ok: false, reason: 'bad_range' });
  });

  it('repairs the range when the quote is found just outside it', () => {
    // cites line 1, but the quote actually lives on line 2 (within the margin).
    const result = verifyCandidate(
      candidate({ evidence: { path: 'src/a.ts', line_start: 1, line_end: 1, quote: 'await thing()' } }),
      files,
      new Set(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidate.evidenceLineStart).toBe(2);
      expect(result.candidate.evidenceLineEnd).toBe(2);
    }
  });

  it('drops as quote_mismatch when the quote is not found even within the margin', () => {
    const result = verifyCandidate(
      candidate({ evidence: { path: 'src/a.ts', line_start: 1, line_end: 1, quote: 'this text does not exist' } }),
      files,
      new Set(),
    );
    expect(result).toEqual({ ok: false, reason: 'quote_mismatch' });
  });

  it('drops an empty or too-long rule as bad_rule', () => {
    expect(verifyCandidate(candidate({ rule: '   ' }), files, new Set())).toEqual({ ok: false, reason: 'bad_rule' });
    expect(verifyCandidate(candidate({ rule: 'x'.repeat(201) }), files, new Set())).toEqual({ ok: false, reason: 'bad_rule' });
  });

  it('drops low confidence', () => {
    const result = verifyCandidate(candidate({ confidence: 0.49 }), files, new Set());
    expect(result).toEqual({ ok: false, reason: 'low_confidence' });
  });

  it('drops a duplicate fingerprint within the same scan', () => {
    const fp = computeFingerprint('Use async/await, not .then()');
    const result = verifyCandidate(candidate(), files, new Set([fp]));
    expect(result).toEqual({ ok: false, reason: 'duplicate' });
  });
});

describe('computeFingerprint', () => {
  it('is stable and normalises case/punctuation/whitespace', () => {
    const a = computeFingerprint('Use  async/await, not .then()!');
    const b = computeFingerprint('use async await not then');
    expect(a).toBe(b);
  });

  it('differs for a different rule', () => {
    expect(computeFingerprint('rule a')).not.toBe(computeFingerprint('rule b'));
  });
});

describe('verifyCandidate carries the support/violation patterns through', () => {
  it('passes both patterns onto the verified candidate unchanged', () => {
    const files = new Map([file('src/a.ts', ['import x', 'await thing()', 'export {}'])]);
    const result = verifyCandidate(
      candidate({ evidence: { path: 'src/a.ts', line_start: 2, line_end: 2, quote: 'await thing()', support_pattern: 'await ', violation_pattern: '\\.then\\(' } }),
      files,
      new Set(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidate.supportPattern).toBe('await ');
      expect(result.candidate.violationPattern).toBe('\\.then\\(');
    }
  });

  it('is null/null when the model gave no patterns', () => {
    const files = new Map([file('src/a.ts', ['import x', 'await thing()', 'export {}'])]);
    const result = verifyCandidate(candidate(), files, new Set());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidate.supportPattern).toBeNull();
      expect(result.candidate.violationPattern).toBeNull();
    }
  });
});

describe('computeMeasuredSupport (§10 improvement #1)', () => {
  it('is null (unmeasurable) below MIN_MEASURED_TOTAL combined matches', () => {
    expect(computeMeasuredSupport(1, 0)).toBeNull();
    expect(computeMeasuredSupport(0, 0)).toBeNull();
  });

  it('computes followed / (followed + violated) once there is enough signal', () => {
    expect(computeMeasuredSupport(8, 2)).toEqual({ ratio: 0.8, followed: 8, violated: 2 });
    expect(computeMeasuredSupport(1, 1)).toEqual({ ratio: 0.5, followed: 1, violated: 1 });
  });
});

describe('applyMeasuredSupport (§10 improvement #1)', () => {
  const base: VerifiedCandidate = {
    category: 'style', rule: 'r', ruleOriginal: 'r', evidencePath: 'a.ts',
    evidenceLineStart: 1, evidenceLineEnd: 1, evidenceSnippet: 'x', confidence: 0.9, fingerprint: 'fp',
    supportPattern: 'await ', violationPattern: '\\.then\\(',
  };

  it('leaves the model confidence alone when unmeasurable (no patterns / too few matches)', () => {
    const result = applyMeasuredSupport(base, null);
    expect(result).toEqual({ ok: true, candidate: base });
  });

  it('replaces confidence with the measured ratio once there is enough signal', () => {
    const result = applyMeasuredSupport(base, { ratio: 0.9, followed: 9, violated: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.candidate.confidence).toBe(0.9);
  });

  it('drops as weak_support when the measured ratio is below the threshold', () => {
    const result = applyMeasuredSupport(base, { ratio: 0.4, followed: 2, violated: 3 });
    expect(result).toEqual({ ok: false, reason: 'weak_support' });
  });
});

describe('rankAndCapCandidates', () => {
  const make = (confidence: number): VerifiedCandidate => ({
    category: 'style',
    rule: `r-${confidence}`,
    ruleOriginal: `r-${confidence}`,
    evidencePath: 'a.ts',
    evidenceLineStart: 1,
    evidenceLineEnd: 1,
    evidenceSnippet: 'x',
    confidence,
    fingerprint: `f-${confidence}`,
    supportPattern: null,
    violationPattern: null,
  });

  it('sorts by confidence descending and caps at 20', () => {
    const many = Array.from({ length: 25 }, (_, i) => make(i / 25));
    const ranked = rankAndCapCandidates(many);
    expect(ranked).toHaveLength(20);
    expect(ranked[0].confidence).toBeGreaterThan(ranked[1].confidence);
    expect(ranked[0].confidence).toBe(24 / 25);
  });
});

describe('filterAlreadyDecided (§4.5 re-scan)', () => {
  it('drops a candidate whose fingerprint the user already decided', () => {
    const kept: VerifiedCandidate = {
      category: 'style', rule: 'kept', ruleOriginal: 'kept', evidencePath: 'a.ts',
      evidenceLineStart: 1, evidenceLineEnd: 1, evidenceSnippet: 'x', confidence: 0.9, fingerprint: 'fp-kept',
      supportPattern: null, violationPattern: null,
    };
    const rejected: VerifiedCandidate = { ...kept, rule: 'rejected', fingerprint: 'fp-rejected' };
    const result = filterAlreadyDecided([kept, rejected], new Set(['fp-rejected']));
    expect(result).toEqual([kept]);
  });
});

describe('selectConfigFiles', () => {
  it('matches known config basenames at root or one level down, capped at 6', () => {
    const paths = [
      '.eslintrc.json', // root, match 1
      '.prettierrc', // root, match 2
      'biome.json', // root, match 3
      '.editorconfig', // root, match 4
      'eslint.config.mjs', // root, match 5
      'packages/tsconfig.json', // one level down, match 6
      'packages/api/tsconfig.json', // two levels down — too deep
      'README.md', // no pattern match
      'tsconfig.build.json', // would be match 7 — dropped by the cap
    ];
    const result = selectConfigFiles(paths);
    expect(result).toHaveLength(6);
    expect(result).toContain('packages/tsconfig.json');
    expect(result).not.toContain('packages/api/tsconfig.json'); // too deep
    expect(result).not.toContain('README.md');
    expect(result).not.toContain('tsconfig.build.json'); // past the cap
  });
});

describe('numberAndCapLines', () => {
  it('numbers each line starting at 1', () => {
    expect(numberAndCapLines('a\nb\nc')).toBe('1: a\n2: b\n3: c');
  });

  it('caps by line count', () => {
    const content = Array.from({ length: 10 }, (_, i) => `l${i}`).join('\n');
    const out = numberAndCapLines(content, 3, 10_000);
    expect(out.split('\n')).toHaveLength(3);
  });

  it('caps by byte size', () => {
    const content = Array.from({ length: 100 }, (_, i) => `line number ${i} with some padding text`).join('\n');
    const out = numberAndCapLines(content, 1000, 200);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(200);
  });
});

describe('buildEvidenceUrl', () => {
  it('builds a blob URL pinned to the scan sha', () => {
    expect(buildEvidenceUrl('acme', 'payments-api', 'abc123', 'src/api/users.ts', 23, 31)).toBe(
      'https://github.com/acme/payments-api/blob/abc123/src/api/users.ts#L23-L31',
    );
  });
});

describe('slugify', () => {
  it('kebab-cases and dedupes collisions', () => {
    const taken = new Set<string>();
    expect(slugify('Use async/await!', taken)).toBe('use-async-await');
    expect(slugify('Use async/await!!', taken)).toBe('use-async-await-2');
  });
});

describe('composeSkillBody', () => {
  it('renders only what it is given, ordered by confidence, with a working header for an empty set', () => {
    const empty = composeSkillBody('acme/api', []);
    expect(empty.body).toContain('# repo-conventions');
    expect(empty.body).toContain('acme/api');
    expect(empty.evidenceFiles).toEqual([]);
    expect(empty.description).toBe('0 house conventions extracted from acme/api');
  });

  it('orders sections by confidence descending', () => {
    const composed = composeSkillBody('acme/api', [
      { rule: 'low', evidencePath: 'a.ts', evidenceLineStart: 1, evidenceLineEnd: 1, evidenceSnippet: 'x', confidence: 0.5 },
      { rule: 'high', evidencePath: 'b.ts', evidenceLineStart: 2, evidenceLineEnd: 2, evidenceSnippet: 'y', confidence: 0.9 },
    ]);
    expect(composed.body.indexOf('## high')).toBeLessThan(composed.body.indexOf('## low'));
  });

  it('dedupes evidence files and formats a single-line vs multi-line location', () => {
    const composed = composeSkillBody('acme/api', [
      { rule: 'r1', evidencePath: 'a.ts', evidenceLineStart: 5, evidenceLineEnd: 5, evidenceSnippet: 'x', confidence: 0.9 },
      { rule: 'r2', evidencePath: 'a.ts', evidenceLineStart: 10, evidenceLineEnd: 12, evidenceSnippet: 'y', confidence: 0.8 },
    ]);
    expect(composed.evidenceFiles).toEqual(['a.ts']);
    expect(composed.body).toContain('`a.ts:5`');
    expect(composed.body).toContain('`a.ts:10-12`');
  });

  it('gives same-named rules distinct slugs', () => {
    const composed = composeSkillBody('acme/api', [
      { rule: 'Use async/await', evidencePath: 'a.ts', evidenceLineStart: 1, evidenceLineEnd: 1, evidenceSnippet: 'x', confidence: 0.9 },
      { rule: 'Use async/await', evidencePath: 'b.ts', evidenceLineStart: 1, evidenceLineEnd: 1, evidenceSnippet: 'y', confidence: 0.8 },
    ]);
    expect(composed.body).toContain('## use-async-await\n');
    expect(composed.body).toContain('## use-async-await-2\n');
  });
});
