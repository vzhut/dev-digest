import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONTEXT_ROOTS,
  classifyDocType,
  countUsedByAgents,
  effectiveRoots,
  resolveRunDocSet,
} from '../src/modules/_shared/project-context.js';

describe('effectiveRoots', () => {
  it('uses stored roots when non-empty, else the default', () => {
    expect(effectiveRoots(['**/adr/**/*.md'])).toEqual(['**/adr/**/*.md']);
    expect(effectiveRoots([])).toEqual([...DEFAULT_CONTEXT_ROOTS]);
    expect(effectiveRoots(null)).toEqual([...DEFAULT_CONTEXT_ROOTS]);
  });
});

describe('classifyDocType', () => {
  it('picks the nearest specs/docs/insights ancestor, else other', () => {
    expect(classifyDocType('a/specs/docs/x.md')).toBe('docs');
    expect(classifyDocType('docs/x.md')).toBe('docs');
    expect(classifyDocType('insights/a/b.md')).toBe('insights');
    expect(classifyDocType('adr/1.md')).toBe('other');
    expect(classifyDocType('README.md')).toBe('other');
  });
});

describe('resolveRunDocSet', () => {
  it('orders agent then skills, first occurrence wins', () => {
    expect(
      resolveRunDocSet(['A', 'B'], [{ contextPaths: ['B', 'C'] }, { contextPaths: ['D'] }]),
    ).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('countUsedByAgents', () => {
  const agent = (id: string, contextPaths: string[]) => ({ id, contextPaths });
  const skill = (id: string, contextPaths: string[], enabled = true) => ({ id, enabled, contextPaths });
  const link = (agentId: string, skillId: string, enabled = true) => ({ agentId, skillId, enabled });

  it('counts 2 direct + 1 via skill as 3', () => {
    const m = countUsedByAgents(
      [agent('a1', ['p']), agent('a2', ['p']), agent('a3', [])],
      [skill('s1', ['p'])],
      [link('a3', 's1')],
    );
    expect(m.get('p')).toBe(3);
  });

  it('counts an agent once when direct and via skill', () => {
    const m = countUsedByAgents([agent('a1', ['p'])], [skill('s1', ['p'])], [link('a1', 's1')]);
    expect(m.get('p')).toBe(1);
  });

  it('ignores a disabled link or a disabled skill', () => {
    const m = countUsedByAgents(
      [agent('a1', []), agent('a2', [])],
      [skill('s1', ['p']), skill('s2', ['q'], false)],
      [link('a1', 's1', false), link('a2', 's2')],
    );
    expect(m.has('p')).toBe(false);
    expect(m.has('q')).toBe(false);
  });

  it('counts a disabled agent attaching directly (no enabled flag on the input)', () => {
    expect(countUsedByAgents([agent('a1', ['p'])], [], []).get('p')).toBe(1);
  });
});
