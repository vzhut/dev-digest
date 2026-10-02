import type {
  FeatureModelChoice,
  FeatureModelId,
  LLMProvider,
  OnboardingTourResponse,
  Provider,
  Tour,
  TourFacts,
  TourUsage,
} from '@devdigest/shared';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { AppError, ConflictError, NotFoundError } from '../../platform/errors.js';
import type { OnboardingRepository } from './repository.js';
import { LLM_MAX_OUTPUT_TOKENS, LLM_TIMEOUT_MS, ONBOARDING_CALL_NAME, ONBOARDING_SCHEMA_NAME } from './constants.js';
import { OnboardingLlmOutput } from './output-schema.js';
import { buildOnboardingPrompt } from './prompt.js';
import { buildSkeleton, formatGeneratedLog, mergeModelOutput, redactDetail, toLastAttempt } from './helpers.js';
import type { PathKinds, SkeletonTourBody, TourBody } from './helpers.js';

type PathKind = 'file' | 'dir' | 'missing';

/** Narrow dependencies (no `Container`, no `modules/repo-intel` import) — wired in `routes.ts`. */
export interface OnboardingServiceDeps {
  repo: Pick<OnboardingRepository, 'getRepoForWorkspace' | 'getTour' | 'saveTour' | 'setLastAttempt'>;
  facts: (repoId: string) => Promise<TourFacts>;
  classifyPaths: (repoId: string, sha: string, paths: string[]) => Promise<Record<string, PathKind>>;
  /** The repo's current index commit; null when never indexed (`''` is mapped to null here). */
  indexSha: (repoId: string) => Promise<string | null>;
  /** True when the clone directory exists (wired from `container.projectDocs.exists`). */
  cloneExists: (cloneDir: string) => Promise<boolean>;
  llm: (provider: Provider) => Promise<LLMProvider>;
  resolveModel: (workspaceId: string, id: FeatureModelId) => Promise<FeatureModelChoice>;
  tokenizer: Tokenizer;
  log: PinoLike;
  /** Per-request LLM timeout; defaults to LLM_TIMEOUT_MS. */
  llmTimeoutMs?: number;
}

/** The race below is only a backstop: the per-request timeout (T2) fires first and cancels the HTTP call. */
const BACKSTOP_GRACE_MS = 5_000;

class LlmTimeoutError extends Error {
  constructor(ms: number) {
    super(`onboarding LLM call timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/** OpenRouter ignores `timeoutMs`, so a hung call is abandoned here. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LlmTimeoutError(ms)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

const normPath = (p: string): string => p.trim().replace(/^\.\//, '').replace(/\/+$/, '');

const isConfigError = (err: unknown): boolean => err instanceof AppError && err.code === 'config_error';

/** D1: tokens/cost from a single-attempt schema failure (`err.usage`); anything else records 0/0/null. */
function usageFromError(err: unknown): { tokensIn: number; tokensOut: number; costUsd: number | null } {
  const u = (err as { usage?: { tokensIn?: unknown; tokensOut?: unknown; costUsd?: unknown } } | null)?.usage;
  if (u && typeof u.tokensIn === 'number' && typeof u.tokensOut === 'number') {
    return { tokensIn: u.tokensIn, tokensOut: u.tokensOut, costUsd: typeof u.costUsd === 'number' ? u.costUsd : null };
  }
  return { tokensIn: 0, tokensOut: 0, costUsd: null };
}

type Outcome =
  | { kind: 'llm'; body: TourBody & { dropped_items: number }; usage: Omit<TourUsage, 'duration_ms' | 'dropped_items'> }
  | { kind: 'skeleton'; skeleton: SkeletonTourBody; usage: Omit<TourUsage, 'duration_ms' | 'dropped_items'> };

const NO_CALL_USAGE = { llm_calls: 0 as const, tokens_in: 0, tokens_out: 0, cost_usd: null, model: null };

/**
 * Onboarding Tour use cases. `generate` makes at most ONE LLM call (single attempt,
 * no retry); the deterministic lists always come from the facts and the model only
 * adds text. A failed regeneration never replaces a stored full tour.
 */
export class OnboardingService {
  /** Repos with a generation running; the service is built once per plugin so this is shared. */
  private inflight = new Set<string>();

  constructor(private deps: OnboardingServiceDeps) {}

  async get(workspaceId: string, repoId: string): Promise<OnboardingTourResponse> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const [tour, sha] = await Promise.all([this.deps.repo.getTour(workspaceId, repoId), this.deps.indexSha(repoId)]);
    const index_sha = sha ? sha : null;
    if (this.inflight.has(repoId)) return { status: 'generating', tour, index_sha };
    if (!(await this.isCloned(repo.clonePath))) return { status: 'not_cloned', index_sha };
    return tour ? { status: 'ready', tour, index_sha } : { status: 'none', tour: null, index_sha };
  }

  async generate(workspaceId: string, repoId: string, opts: { correlationId?: string } = {}): Promise<Tour> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!(await this.isCloned(repo.clonePath))) {
      throw new ConflictError('not_cloned', 'The repository is not cloned locally');
    }
    // F12: check-and-set with no `await` in between, so two requests cannot both pass.
    if (this.inflight.has(repoId)) throw new ConflictError('generation_in_progress', 'A tour is already being generated');
    this.inflight.add(repoId);
    try {
      return await this.run(workspaceId, repoId, repo, opts.correlationId);
    } finally {
      this.inflight.delete(repoId);
    }
  }

  // ---- internals -----------------------------------------------------------

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.deps.repo.getRepoForWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  private async isCloned(clonePath: string | null): Promise<boolean> {
    return !!clonePath && (await this.deps.cloneExists(clonePath));
  }

  private async run(
    workspaceId: string,
    repoId: string,
    repo: { owner: string; name: string },
    correlationId: string | undefined,
  ): Promise<Tour> {
    const t0 = Date.now();
    const facts = await this.deps.facts(repoId);
    const stored = await this.deps.repo.getTour(workspaceId, repoId);

    const outcome = await this.produce(workspaceId, repoId, repo, facts, correlationId);
    const usage: TourUsage = {
      ...outcome.usage,
      duration_ms: Date.now() - t0,
      dropped_items: outcome.kind === 'llm' ? outcome.body.dropped_items : 0,
    };
    const at = new Date().toISOString();

    let tour: Tour;
    if (outcome.kind === 'llm') {
      const { dropped_items: _dropped, ...body } = outcome.body;
      const { status, reason, files_indexed, files_skipped, files_total, bounded, hotness_available } = facts.index;
      tour = {
        repo_id: repoId,
        generated_at: at,
        source_sha: facts.source_sha,
        mode: 'llm',
        skeleton_reason: null,
        skeleton_detail: null,
        index: { status, reason, files_indexed, files_skipped, files_total, bounded, hotness_available },
        usage,
        ...body,
      };
      await this.deps.repo.saveTour(repoId, tour);
    } else {
      const sk = outcome.skeleton;
      if (stored && stored.mode === 'llm') {
        // AC-23: keep the full tour, only record the failed attempt.
        const last_attempt = toLastAttempt(at, sk.skeleton_reason, sk.skeleton_detail, usage);
        await this.deps.repo.setLastAttempt(repoId, last_attempt);
        tour = { ...stored, last_attempt };
      } else {
        const { index, ...rest } = sk;
        tour = { repo_id: repoId, generated_at: at, source_sha: facts.source_sha, index, usage, ...rest };
        await this.deps.repo.saveTour(repoId, tour);
      }
    }

    this.deps.log.info(
      { event: 'onboarding.generated', repoId },
      formatGeneratedLog({
        owner: repo.owner,
        name: repo.name,
        mode: outcome.kind === 'llm' ? 'llm' : 'skeleton',
        skeletonReason: outcome.kind === 'skeleton' ? outcome.skeleton.skeleton_reason : null,
        usage,
      }),
    );
    return tour;
  }

  /** Decide the outcome: index gate → model/key → ONE call → grounded merge. Never throws for LLM-side failures. */
  private async produce(
    workspaceId: string,
    repoId: string,
    repo: { owner: string; name: string },
    facts: TourFacts,
    correlationId: string | undefined,
  ): Promise<Outcome> {
    const skeleton = (reason: SkeletonTourBody['skeleton_reason'], detail: string | null, usage: Outcome['usage']): Outcome => ({
      kind: 'skeleton',
      skeleton: buildSkeleton(facts, reason, detail),
      usage,
    });

    if (!facts.index.usable) {
      return skeleton('index_degraded', facts.index.unusable_reason ?? 'index unusable', NO_CALL_USAGE);
    }

    let choice: FeatureModelChoice;
    let llm: LLMProvider;
    try {
      choice = await this.deps.resolveModel(workspaceId, 'onboarding');
      llm = await this.deps.llm(choice.provider);
    } catch (err) {
      if (!isConfigError(err)) throw err;
      return skeleton('llm_unavailable', (err as Error).message, NO_CALL_USAGE);
    }
    const modelLabel = `${choice.provider}/${choice.model}`;

    const prompt = buildOnboardingPrompt(facts, (text) => this.deps.tokenizer.count(text));
    // Counts and section names only — never prompt text, README or repo content.
    this.deps.log.info(
      {
        event: 'prompt.assembled',
        call: ONBOARDING_CALL_NAME,
        model: modelLabel,
        ...(correlationId ? { correlation_id: correlationId } : {}),
        sections: prompt.components.map((c) => ({ name: c.name, source: c.source, chars: c.chars })),
        total_chars: prompt.messages.reduce((n, m) => n + m.content.length, 0),
        est_tokens: prompt.tokens,
      },
      `onboarding: prompt components — ${prompt.components.map((c) => `${c.name} ${c.chars}ch`).join(', ')}; est ≈${prompt.tokens} tokens`,
    );

    const timeoutMs = this.deps.llmTimeoutMs ?? LLM_TIMEOUT_MS;
    let result;
    try {
      result = await withTimeout(
        llm.completeStructured({
          model: choice.model,
          schema: OnboardingLlmOutput,
          schemaName: ONBOARDING_SCHEMA_NAME,
          messages: prompt.messages,
          singleAttempt: true,
          maxRetries: 0,
          maxTokens: LLM_MAX_OUTPUT_TOKENS,
          timeoutMs,
          requireParameters: true,
          sessionId: `${repo.owner}/${repo.name}:onboarding`,
        }),
        timeoutMs + BACKSTOP_GRACE_MS,
      );
    } catch (err) {
      const u = usageFromError(err);
      return skeleton('llm_failed', (err as Error)?.message ?? 'LLM call failed', {
        llm_calls: 1,
        tokens_in: u.tokensIn,
        tokens_out: u.tokensOut,
        cost_usd: u.costUsd,
        model: modelLabel,
      });
    }

    const usage = {
      llm_calls: 1 as const,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd,
      model: modelLabel,
    };
    try {
      const paths = [...new Set(result.data.first_tasks.map((t) => normPath(t.path)).filter((p) => p.length > 0))];
      const kinds = paths.length > 0 ? await this.deps.classifyPaths(repoId, facts.source_sha, paths) : {};
      const pathKinds: PathKinds = new Map(
        Object.entries(kinds).flatMap(([p, k]): [string, 'file' | 'dir'][] => (k === 'missing' ? [] : [[normPath(p), k]])),
      );
      return { kind: 'llm', body: mergeModelOutput(facts, result.data, pathKinds), usage };
    } catch (err) {
      return skeleton('llm_failed', redactDetail((err as Error)?.message ?? 'merge failed'), usage);
    }
  }
}
