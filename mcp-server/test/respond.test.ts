import { describe, expect, it } from 'vitest';
import { ok, toolError } from '../src/format/errors.js';
import { compact, limitWithHint, MAX_RESPONSE_CHARS, serialize } from '../src/format/respond.js';
import * as contracts from '../src/contracts.js';
import { z } from 'zod';

describe('compact / ok', () => {
  it('drops null, undefined, empty strings and empty arrays but keeps 0/false and primary lists', () => {
    const out = compact({ a: null, b: undefined, c: '', d: [], e: 0, f: false, findings: [], nested: { x: null, y: 1 }, list: [null, 1] });
    expect(out).toEqual({ e: 0, f: false, findings: [], nested: { y: 1 }, list: [1] });
  });

  it('ok() emits one compact JSON text block without null', () => {
    const r = ok({ status: 'done', verdict: null, findings: [], hint: undefined });
    expect(r.isError).toBeUndefined();
    expect(r.content).toHaveLength(1);
    expect(r.content[0]?.text).toBe('{"status":"done","findings":[]}');
    expect(r.content[0]?.text).not.toContain('null');
  });

  it('toolError() sets isError with the message', () => {
    expect(toolError('nope')).toEqual({ isError: true, content: [{ type: 'text', text: 'nope' }] });
  });
});

describe('limitWithHint', () => {
  it('adds a hint only when items were left out', () => {
    expect(limitWithHint([1, 2, 3], 2, (s, t) => `${s}/${t}`)).toEqual({ items: [1, 2], shown: 2, total: 3, hint: '2/3' });
    expect(limitWithHint([1, 2], 5, () => 'x')).toEqual({ items: [1, 2], shown: 2, total: 2 });
  });
});

describe('size cap', () => {
  it('cuts the primary list and adds a hint when the response exceeds the cap', () => {
    const findings = Array.from({ length: 400 }, (_, i) => ({ title: `finding ${i} `.repeat(20), i }));
    const text = serialize({ status: 'done', findings, shown: 400, total: 400 }, 'findings');
    expect(text.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    const parsed = JSON.parse(text) as { findings: unknown[]; shown: number; total: number; hint: string };
    expect(parsed.findings.length).toBeLessThan(400);
    expect(parsed.shown).toBe(parsed.findings.length);
    expect(parsed.total).toBe(400);
    expect(parsed.hint).toContain('size cap');
  });

  it('keeps an existing hint and stays valid JSON without a list key', () => {
    const big = serialize({ status: 'x', blob: 'y'.repeat(30_000) });
    expect(big.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    expect(JSON.parse(big).hint).toContain('size cap');
  });
});

describe('contracts', () => {
  it('every raw shape is scalar-only (string / number / enum, optionally wrapped)', () => {
    const shapes = [
      contracts.listAgentsShape,
      contracts.runAgentOnPrShape,
      contracts.getFindingsShape,
      contracts.getConventionsShape,
      contracts.getBlastRadiusShape,
    ];
    const unwrap = (t: z.ZodTypeAny): z.ZodTypeAny =>
      t instanceof z.ZodOptional || t instanceof z.ZodDefault ? unwrap(t._def.innerType) : t;
    for (const shape of shapes) {
      for (const [key, t] of Object.entries(shape as Record<string, z.ZodTypeAny>)) {
        const inner = unwrap(t);
        const scalar = inner instanceof z.ZodString || inner instanceof z.ZodNumber || inner instanceof z.ZodEnum;
        expect(scalar, key).toBe(true);
        expect((t.description ?? '').length, key).toBeLessThanOrEqual(60);
        expect(t.description, key).toBeTruthy();
      }
    }
  });

  it('validates ranges and defaults', () => {
    const run = z.object(contracts.runAgentOnPrShape);
    expect(run.parse({ repo: 'a/b', pr: 1, agent: 'x' }).wait_seconds).toBe(120);
    expect(run.safeParse({ repo: 'a/b', pr: -1, agent: 'x' }).success).toBe(false);
    expect(run.safeParse({ repo: 'a/b', pr: 1, agent: 'x', wait_seconds: 10 }).success).toBe(false);
    expect(run.safeParse({ repo: 'a/b', pr: 1, agent: 'x', wait_seconds: 121 }).success).toBe(false);
    const f = z.object(contracts.getFindingsShape).parse({ repo: 'a/b', pr: 1 });
    expect(f).toMatchObject({ severity_min: 'SUGGESTION', limit: 20, response_format: 'concise' });
    expect(z.object(contracts.getFindingsShape).safeParse({ repo: 'a/b', pr: 1, run_id: 'nope' }).success).toBe(false);
  });
});
