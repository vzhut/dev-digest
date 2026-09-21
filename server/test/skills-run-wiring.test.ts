import { describe, it, expect } from 'vitest';
import { resolveRunSkills, toPromptSkills, type AgentSkillLinkRow } from '../src/modules/reviews/helpers.js';
import { normalizeSkillsBody } from '../src/modules/agents/helpers.js';

const link = (
  id: string,
  order: number,
  o: Partial<{ linkEnabled: boolean; enabled: boolean; source: string }> = {},
): AgentSkillLinkRow => ({
  order,
  linkEnabled: o.linkEnabled ?? true,
  skill: { id, name: `n-${id}`, body: `b-${id}`, source: o.source ?? 'manual', enabled: o.enabled ?? true },
});

describe('resolveRunSkills', () => {
  it('requires both link and skill enabled', () => {
    const out = resolveRunSkills([
      link('a', 0),
      link('b', 1, { linkEnabled: false }),
      link('c', 2, { enabled: false }),
    ]);
    expect(out.map((s) => s.id)).toEqual(['a']);
  });

  it('orders by agent_skills.order ascending', () => {
    expect(resolveRunSkills([link('x', 2), link('y', 0), link('z', 1)]).map((s) => s.id)).toEqual(['y', 'z', 'x']);
  });

  it('maps trusted by source', () => {
    const out = resolveRunSkills([
      link('a', 0, { source: 'manual' }),
      link('b', 1, { source: 'extracted' }),
      link('c', 2, { source: 'imported_url' }),
      link('d', 3, { source: 'community' }),
    ]);
    expect(out.map((s) => s.trusted)).toEqual([true, true, false, false]);
  });

  it('returns empty when nothing qualifies and strips ids for the prompt', () => {
    expect(resolveRunSkills([])).toEqual([]);
    expect(toPromptSkills(resolveRunSkills([link('a', 0)]))).toEqual([{ name: 'n-a', body: 'b-a', trusted: true }]);
  });
});

describe('normalizeSkillsBody', () => {
  it('skills form keeps per-item enabled, defaulting true', () => {
    expect(normalizeSkillsBody({ skills: [{ skill_id: 'a', enabled: false }, { skill_id: 'b' }] })).toEqual({
      kind: 'set',
      items: [{ skill_id: 'a', enabled: false }, { skill_id: 'b', enabled: true }],
    });
  });
  it('skill_ids implies enabled', () => {
    expect(normalizeSkillsBody({ skill_ids: ['a'] })).toEqual({ kind: 'set', items: [{ skill_id: 'a', enabled: true }] });
  });
  it('single skill_id links', () => {
    expect(normalizeSkillsBody({ skill_id: 'a', order: 2 })).toEqual({ kind: 'link', skillId: 'a', order: 2 });
    expect(normalizeSkillsBody({ skill_id: 'a' })).toEqual({ kind: 'link', skillId: 'a' });
  });
});
