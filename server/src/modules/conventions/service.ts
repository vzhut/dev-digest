import type { ConventionCandidate, ConventionStatus, ConventionsResponse, RepoRef, Skill } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository, type ConventionRow, type InsertConvention } from './repository.js';
import {
  type AcceptedConvention,
  composeSkillBody,
  filterAlreadyDecided,
  numberAndCapLines,
  rankAndCapCandidates,
  selectConfigFiles,
  toConventionCandidateDto,
  toConventionScanDto,
  toSkillDtoFromRow,
  verifyCandidate,
  type DropReason,
  type FileLines,
  type ModelCandidate,
  type VerifiedCandidate,
} from './helpers.js';
import { listRootAndOneLevelDown } from './sampler.js';
import {
  buildConventionExtractionUserMessage,
  CONVENTION_EXTRACTION_SCHEMA_NAME,
  CONVENTION_EXTRACTION_SYSTEM_PROMPT,
  ConventionExtractionOutput,
  type SampledFile,
} from './prompt.js';
import { DEFAULT_SKILL_NAME, MAX_SOURCE_FILES } from './constants.js';

export interface SkillDraft {
  name: string;
  description: string;
  type: 'convention';
  body: string;
  evidence_files: string[];
  count: number;
}

export interface CreateSkillInput {
  name?: string;
  description?: string;
  body?: string;
  enabled?: boolean;
  /** C13 — linked last, `enabled: true`. An id that doesn't resolve in this
   * workspace is skipped, not fatal — the skill is still created. */
  agentIds?: string[];
}

export interface CreateSkillResult {
  skill: Skill;
  agentIdsLinked: string[];
}

/**
 * Conventions Extractor service (§4). `extract` is the one place all the
 * pure helpers get wired against real IO: repo-intel for sample paths,
 * GitClient for file content, the resolved feature model for the LLM call.
 * Nothing is persisted until the model call AND verification both succeed —
 * a failed scan leaves the previous scan/candidates exactly as they were
 * (§5 "LLM failure keeps the previous scan").
 */
export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  /** Latest scan + every candidate row for the repo (§4.1 GET). */
  async get(workspaceId: string, repoId: string): Promise<ConventionsResponse> {
    const repoBasics = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repoBasics) throw new NotFoundError('Repo not found');

    const [scan, rows] = await Promise.all([
      this.repo.getLatestScan(workspaceId, repoId),
      this.repo.listByRepo(workspaceId, repoId),
    ]);

    return {
      scan: scan ? toConventionScanDto(scan) : null,
      candidates: rows.map((row) => toConventionCandidateDto(row, repoBasics.owner, repoBasics.name)),
    };
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionsResponse> {
    const repoBasics = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repoBasics) throw new NotFoundError('Repo not found');
    if (!repoBasics.clonePath) {
      throw new AppError('not_cloned', 'This repo has not been cloned yet', 409);
    }

    const sourcePaths = await this.container.repoIntel.getConventionSamples(repoId, MAX_SOURCE_FILES);
    if (sourcePaths.length === 0) {
      // §4.2 step 4 — repo-intel is off or this repo isn't indexed yet. Never
      // fall back to a filesystem walk; that would be a second indexer.
      throw new AppError('not_indexed', 'Index this repo before extracting conventions', 409);
    }

    const ref: RepoRef = { owner: repoBasics.owner, name: repoBasics.name };
    const sha = await this.container.git.currentHead(ref);

    const configPaths = selectConfigFiles(await listRootAndOneLevelDown(repoBasics.clonePath));
    const [configFiles, sourceFiles] = await Promise.all([
      this.readFiles(ref, configPaths),
      this.readFiles(ref, sourcePaths),
    ]);

    const filesForVerification = new Map<string, FileLines>();
    for (const f of [...configFiles, ...sourceFiles]) {
      filesForVerification.set(f.path, { path: f.path, lines: f.content.split('\n') });
    }

    const promptConfigFiles: SampledFile[] = configFiles.map((f) => ({ path: f.path, content: f.content }));
    const promptSourceFiles: SampledFile[] = sourceFiles.map((f) => ({ path: f.path, content: numberAndCapLines(f.content) }));

    const modelChoice = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(modelChoice.provider);
    const result = await llm.completeStructured({
      model: modelChoice.model,
      schema: ConventionExtractionOutput,
      schemaName: CONVENTION_EXTRACTION_SCHEMA_NAME,
      messages: [
        { role: 'system', content: CONVENTION_EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: buildConventionExtractionUserMessage(promptConfigFiles, promptSourceFiles) },
      ],
    });

    const modelCandidates: ModelCandidate[] = result.data.candidates;
    const dropped: Record<DropReason, number> = {
      no_file: 0,
      bad_range: 0,
      quote_mismatch: 0,
      bad_rule: 0,
      low_confidence: 0,
      duplicate: 0,
    };
    const seenFingerprints = new Set<string>();
    const verified: VerifiedCandidate[] = [];
    for (const candidate of modelCandidates) {
      const verdict = verifyCandidate(candidate, filesForVerification, seenFingerprints);
      if (verdict.ok) {
        verified.push(verdict.candidate);
        seenFingerprints.add(verdict.candidate.fingerprint);
      } else {
        dropped[verdict.reason]++;
      }
    }

    const decidedFingerprints = await this.repo.getDecidedFingerprints(workspaceId, repoId);
    const notAlreadyDecided = filterAlreadyDecided(verified, decidedFingerprints);
    // A candidate that re-extracts a rule the user already ruled on is not a
    // quality problem — count it in the same bucket as an in-scan duplicate.
    dropped.duplicate += verified.length - notAlreadyDecided.length;

    const rankedKept = rankAndCapCandidates(notAlreadyDecided);

    const scan = await this.repo.insertScan({
      workspaceId,
      repoId,
      sha,
      sampleFiles: configFiles.length + sourceFiles.length,
      rawCount: modelCandidates.length,
      keptCount: rankedKept.length,
      dropped,
      model: `${modelChoice.provider}/${modelChoice.model}`,
      costUsd: result.costUsd ?? null,
    });

    await this.repo.deletePendingByRepo(workspaceId, repoId);
    const toInsert: InsertConvention[] = rankedKept.map((c) => ({
      workspaceId,
      repoId,
      scanId: scan.id,
      category: c.category,
      rule: c.rule,
      ruleOriginal: c.ruleOriginal,
      evidencePath: c.evidencePath,
      evidenceLineStart: c.evidenceLineStart,
      evidenceLineEnd: c.evidenceLineEnd,
      evidenceSnippet: c.evidenceSnippet,
      confidence: c.confidence,
      fingerprint: c.fingerprint,
    }));
    await this.repo.insertCandidates(toInsert);

    const rows = await this.repo.listByRepo(workspaceId, repoId);
    return {
      scan: toConventionScanDto(scan),
      candidates: rows.map((row) => toConventionCandidateDto(row, repoBasics.owner, repoBasics.name)),
    };
  }

  /** Accept / reject / edit one candidate (§4.1 PATCH). Editing only changes
   * `rule` — `ruleOriginal` (and so the `edited` flag) is untouched. */
  async patch(
    workspaceId: string,
    repoId: string,
    candidateId: string,
    patch: { status?: ConventionStatus; rule?: string },
  ): Promise<ConventionCandidate> {
    const repoBasics = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repoBasics) throw new NotFoundError('Repo not found');
    if (patch.status === undefined && patch.rule === undefined) {
      throw new ValidationError('status or rule is required');
    }

    const row = await this.repo.updateCandidate(workspaceId, repoId, candidateId, patch);
    if (!row) throw new NotFoundError('Convention candidate not found');
    const scanSha = await this.repo.getScanSha(row.scanId);
    return toConventionCandidateDto({ ...row, scanSha: scanSha ?? '' }, repoBasics.owner, repoBasics.name);
  }

  /** Pure read — composes from the CURRENT accepted rows but persists nothing (§4.1). */
  async getSkillDraft(workspaceId: string, repoId: string): Promise<SkillDraft> {
    const repoBasics = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repoBasics) throw new NotFoundError('Repo not found');
    const accepted = await this.repo.getAcceptedByRepo(workspaceId, repoId);
    const composed = composeSkillBody(`${repoBasics.owner}/${repoBasics.name}`, toAcceptedConventions(accepted));
    return {
      name: DEFAULT_SKILL_NAME,
      description: composed.description,
      type: 'convention',
      body: composed.body,
      evidence_files: composed.evidenceFiles,
      count: accepted.length,
    };
  }

  /** Saves the (possibly hand-edited) draft as an `extracted` skill, v1, and
   * links it to the requested agents (C13). 409 on a name clash (C9) — the
   * client offers rename/update from there. */
  async createSkill(workspaceId: string, repoId: string, input: CreateSkillInput): Promise<CreateSkillResult> {
    const repoBasics = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repoBasics) throw new NotFoundError('Repo not found');

    const accepted = await this.repo.getAcceptedByRepo(workspaceId, repoId);
    const composed = composeSkillBody(`${repoBasics.owner}/${repoBasics.name}`, toAcceptedConventions(accepted));

    const name = input.name?.trim() || DEFAULT_SKILL_NAME;
    const clash = await this.container.skillsRepo.getByName(workspaceId, name);
    if (clash) {
      throw new AppError('conflict', `A skill named "${name}" already exists`, 409, { existing_skill_id: clash.id });
    }

    const row = await this.container.skillsRepo.insert({
      workspaceId,
      name,
      description: input.description ?? composed.description,
      type: 'convention',
      source: 'extracted',
      body: input.body ?? composed.body,
      enabled: input.enabled ?? true,
      evidenceFiles: composed.evidenceFiles,
    });

    const agentIdsLinked: string[] = [];
    for (const agentId of input.agentIds ?? []) {
      const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
      if (!agent) continue; // best-effort — an id that doesn't resolve is skipped, not fatal
      const existing = await this.container.agentsRepo.linkedSkills(agentId);
      await this.container.agentsRepo.linkSkill(agentId, row.id, existing.length, true);
      agentIdsLinked.push(agentId);
    }

    return { skill: toSkillDtoFromRow(row), agentIdsLinked };
  }

  private async readFiles(ref: RepoRef, paths: string[]): Promise<{ path: string; content: string }[]> {
    const results = await Promise.all(
      paths.map(async (path) => {
        try {
          return { path, content: await this.container.git.readFile(ref, path) };
        } catch {
          return null; // unreadable file (deleted between listing and read, binary, …) — skip it
        }
      }),
    );
    return results.filter((r): r is { path: string; content: string } => r !== null);
  }
}

function toAcceptedConventions(rows: ConventionRow[]): AcceptedConvention[] {
  return rows.map((r) => ({
    rule: r.rule,
    evidencePath: r.evidencePath,
    evidenceLineStart: r.evidenceLineStart,
    evidenceLineEnd: r.evidenceLineEnd,
    evidenceSnippet: r.evidenceSnippet,
    confidence: r.confidence,
  }));
}
