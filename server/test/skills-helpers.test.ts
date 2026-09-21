import { describe, it, expect } from 'vitest';
import {
  bodyChanged,
  computeAcceptRate,
  isUniqueViolation,
  statsWindowStart,
  toSkillDto,
  toSkillVersionDto,
} from '../src/modules/skills/helpers.js';
import { MS_PER_DAY } from '../src/modules/skills/constants.js';

describe('skills helpers', () => {
  it('computeAcceptRate is null (not 0) with no verdicts', () => {
    expect(computeAcceptRate(0, 0)).toBeNull();
    expect(computeAcceptRate(0, 3)).toBe(0);
    expect(computeAcceptRate(3, 1)).toBe(0.75);
  });

  it('statsWindowStart is exactly 30 days back', () => {
    const now = new Date('2026-06-30T12:00:00Z');
    expect(now.getTime() - statsWindowStart(now).getTime()).toBe(30 * MS_PER_DAY);
  });

  it('bodyChanged only for a defined, different body', () => {
    expect(bodyChanged('a', undefined)).toBe(false);
    expect(bodyChanged('a', 'a')).toBe(false);
    expect(bodyChanged('a', 'b')).toBe(true);
  });

  it('isUniqueViolation sees code directly or via cause', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it('maps rows to snake_case DTOs', () => {
    const dto = toSkillDto({
      id: 'i', workspaceId: 'w', name: 'n', description: 'd', type: 'rubric', source: 'manual',
      body: 'b', enabled: true, version: 2, evidenceFiles: null, createdAt: new Date(),
    } as never);
    expect(dto).toEqual({
      id: 'i', name: 'n', description: 'd', type: 'rubric', source: 'manual',
      body: 'b', enabled: true, version: 2, evidence_files: null,
    });
    const v = toSkillVersionDto({ skillId: 's', version: 1, body: 'x', createdAt: new Date('2026-01-01T00:00:00Z') });
    expect(v).toEqual({ skill_id: 's', version: 1, body: 'x', created_at: '2026-01-01T00:00:00.000Z' });
  });
});
