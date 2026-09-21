import type { Container } from '../../platform/container.js';
import type { Skill, SkillStats, SkillType, SkillVersion } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { SkillsRepository, type SkillPatch, type SkillRow } from './repository.js';
import {
  bodyChanged,
  computeAcceptRate,
  isNameViolation,
  statsWindowStart,
  toSkillDto,
  toSkillVersionDto,
} from './helpers.js';

/**
 * Skills service. Rules: a body change snapshots the previous body into
 * skill_versions and bumps `version` (metadata-only edits don't); restore
 * appends a new version (history is append-only); names are unique per
 * workspace (409 on collision).
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  /** Optional label for the new version (only used when the body changes). */
  message?: string;
}

export interface ImportedSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export interface UpdateFromImportInput {
  description: string;
  type: SkillType;
  body: string;
}

const nameTaken = (name: string) =>
  new AppError('conflict', `A skill named "${name}" already exists`, 409);

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    return (await this.repo.list(workspaceId)).map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async findByName(workspaceId: string, name: string): Promise<Skill | undefined> {
    const row = await this.repo.getByName(workspaceId, name);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    return this.insert(workspaceId, { ...input, source: 'manual', enabled: input.enabled ?? true });
  }

  /** Confirmed import: source 'imported_url', disabled until vetted (D4). */
  async createImported(workspaceId: string, input: ImportedSkillInput): Promise<Skill> {
    return this.insert(workspaceId, { ...input, source: 'imported_url', enabled: false });
  }

  /** Take a newer release of an existing skill: new version if body changed, keeps enabled. */
  async updateFromImport(
    workspaceId: string,
    skillId: string,
    input: UpdateFromImportInput,
  ): Promise<Skill> {
    const updated = await this.update(workspaceId, skillId, {
      description: input.description,
      type: input.type,
      body: input.body,
      message: 'Imported update',
    });
    if (!updated) throw new NotFoundError('Skill not found');
    return updated;
  }

  async update(workspaceId: string, id: string, input: UpdateSkillInput): Promise<Skill | undefined> {
    const current = await this.repo.getById(workspaceId, id);
    if (!current) return undefined;
    if (input.name !== undefined && input.name !== current.name) {
      const clash = await this.repo.getByName(workspaceId, input.name);
      if (clash && clash.id !== id) throw nameTaken(input.name);
    }
    const patch: SkillPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.type !== undefined) patch.type = input.type;
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    const changed = bodyChanged(current.body, input.body);
    if (changed) {
      patch.body = input.body as string;
      // Blank → null: the history then shows "(no message)" instead of an empty label.
      patch.versionMessage = input.message?.trim() || null;
    }
    try {
      const row = await this.repo.update(workspaceId, id, patch, changed);
      return row ? toSkillDto(row) : undefined;
    } catch (err) {
      if (input.name !== undefined && isNameViolation(err)) throw nameTaken(input.name);
      throw err;
    }
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /** Newest first; undefined when the skill isn't in the workspace. */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    if (!(await this.repo.getById(workspaceId, id))) return undefined;
    return (await this.repo.listVersions(workspaceId, id)).map(toSkillVersionDto);
  }

  /** Re-apply an old body as a NEW version. undefined when skill or version is unknown. */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
    message?: string,
  ): Promise<Skill | undefined> {
    const old = await this.repo.getVersion(workspaceId, id, version);
    if (!old) return undefined;
    return this.update(workspaceId, id, {
      body: old.body,
      message: message?.trim() || `Restored from v${version}`,
    });
  }

  /** 30-day stats over runs that really carried this skill. undefined when unknown skill. */
  async stats(workspaceId: string, id: string, now: Date = new Date()): Promise<SkillStats | undefined> {
    if (!(await this.repo.getById(workspaceId, id))) return undefined;
    const raw = await this.repo.statsRaw(workspaceId, id, statsWindowStart(now));
    return {
      used_by: raw.agents.length,
      agents: raw.agents,
      runs_30d: raw.runs,
      findings_30d: raw.findings,
      accept_rate: computeAcceptRate(raw.accepted, raw.dismissed),
      findings_by_category: raw.byCategory,
    };
  }

  private async insert(
    workspaceId: string,
    input: CreateSkillInput & { source: SkillRow['source']; enabled: boolean },
  ): Promise<Skill> {
    if (await this.repo.getByName(workspaceId, input.name)) throw nameTaken(input.name);
    try {
      const row = await this.repo.insert({ workspaceId, ...input });
      return toSkillDto(row);
    } catch (err) {
      if (isNameViolation(err)) throw nameTaken(input.name);
      throw err;
    }
  }
}
