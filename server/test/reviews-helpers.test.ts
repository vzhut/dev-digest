import { describe, it, expect } from 'vitest';
import { taskLine, findingRowToDto } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

describe('findingRowToDto — intent scope fields', () => {
  const row = {
    id: 'f1',
    reviewId: 'r1',
    severity: 'SUGGESTION',
    category: 'bug',
    title: 't',
    file: 'a.ts',
    startLine: 1,
    endLine: 2,
    rationale: 'r',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifectaComponents: null,
    acceptedAt: null,
    dismissedAt: null,
  };

  it('maps scope + original_severity for a downgraded out-of-scope finding', () => {
    const dto = findingRowToDto({ ...row, scope: 'out_of_scope', originalSeverity: 'WARNING' } as never);
    expect(dto).toMatchObject({ severity: 'SUGGESTION', scope: 'out_of_scope', original_severity: 'WARNING' });
  });

  it('maps rows without scope (no intent injected) to nulls', () => {
    const dto = findingRowToDto({ ...row, scope: null, originalSeverity: null } as never);
    expect(dto.scope).toBeNull();
    expect(dto.original_severity).toBeNull();
  });
});
