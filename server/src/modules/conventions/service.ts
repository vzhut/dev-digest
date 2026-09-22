import type { ConventionsResponse, RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository, type InsertConvention } from './repository.js';
import {
  filterAlreadyDecided,
  numberAndCapLines,
  rankAndCapCandidates,
  selectConfigFiles,
  toConventionCandidateDto,
  toConventionScanDto,
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
import { MAX_SOURCE_FILES } from './constants.js';

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
