import type {
  BlastRadius,
  BriefInputs,
  BriefMissingInput,
  FeatureModelChoice,
  FeatureModelId,
  Intent,
  LLMProvider,
  PrBrief,
  PrBriefResponse,
  PrIntentRecord,
  Provider,
} from '@devdigest/shared';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import type { ProjectDocs } from '../../adapters/project-docs/index.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { AppError, ConflictError, NotFoundError } from '../../platform/errors.js';
import { redactSecrets } from '../_shared/redact.js';
import type { BriefRepository } from './repository.js';
import { BACKSTOP_GRACE_MS, LLM_TIMEOUT_MS, RISK_BRIEF_CALL_NAME, RISK_BRIEF_SCHEMA_NAME } from './constants.js';
import { formatBriefLog, groundBrief, blastFiles, isStale, normalizeRepoPath, toDiffStats } from './helpers.js';
import { BriefLlmOutput, BriefLlmOutputWire } from './output-schema.js';
import { buildRiskBriefPrompt, type BriefFacts } from './prompt.js';

/** Outcome of the linked-issue lookup (structurally what `IntentService.firstLinkedIssue` returns). */
export type BriefLinkedIssue =
  | { status: 'ok'; issue: { title: string; body?: string | null } }
  | { status: 'missing'; reason: string };

/** Narrow dependencies (no `Container`, no other module's folder) — wired in `routes.ts`. */
export interface BriefServiceDeps {
  repo: Pick<BriefRepository, 'findPull' | 'getFiles' | 'getBrief' | 'saveBrief' | 'attachedDocPaths'>;
  /** The stored intent (null when never derived). */
  intent: (workspaceId: string, prId: string) => Promise<PrIntentRecord | null>;
  linkedIssue: (workspaceId: string, prId: string) => Promise<BriefLinkedIssue>;
  blast: (workspaceId: string, prId: string) => Promise<BlastRadius>;
  docs: Pick<ProjectDocs, 'read' | 'exists'>;
  llm: (provider: Provider) => Promise<LLMProvider>;
  resolveModel: (workspaceId: string, id: FeatureModelId) => Promise<FeatureModelChoice>;
  tokenizer: Tokenizer;
  log: PinoLike;
  /** Per-request LLM timeout; defaults to LLM_TIMEOUT_MS. */
  llmTimeoutMs?: number;
}

class LlmTimeoutError extends Error {
  constructor(ms: number) {
    super(`brief LLM call timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/** Some providers ignore `timeoutMs`, so a hung call is abandoned here. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LlmTimeoutError(ms)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

const isConfigError = (err: unknown): boolean => err instanceof AppError && err.code === 'config_error';

const reasonOf = (err: unknown): string => redactSecrets((err as Error)?.message || 'unknown error');

/** Tokens/cost of a single-attempt schema failure (`err.usage`); anything else records 0/0/null. */
function usageFromError(err: unknown): { tokensIn: number; tokensOut: number; costUsd: number | null } {
  const u = (err as { usage?: { tokensIn?: unknown; tokensOut?: unknown; costUsd?: unknown } } | null)?.usage;
  if (u && typeof u.tokensIn === 'number' && typeof u.tokensOut === 'number') {
    return { tokensIn: u.tokensIn, tokensOut: u.tokensOut, costUsd: typeof u.costUsd === 'number' ? u.costUsd : null };
  }
  return { tokensIn: 0, tokensOut: 0, costUsd: null };
}

interface Gathered {
  facts: BriefFacts;
  missing: BriefMissingInput[];
  skipped: string[];
  notes: string[];
}

/**
 * PR brief use cases. `generate` makes at most ONE LLM call (single attempt, no
 * retry) over computed facts only; a failed generation stores nothing and keeps
 * the previous brief. `get` never calls the model.
 */
export class BriefService {
  /** PRs with a generation running; the service is built once per plugin so this is shared. */
  private inflight = new Set<string>();

  constructor(private deps: BriefServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const ctx = await this.requirePull(workspaceId, prId);
    const brief = await this.deps.repo.getBrief(workspaceId, prId);
    const stale = brief ? isStale(brief.head_sha, ctx.pull.headSha) : false;
    if (this.inflight.has(prId)) return { status: 'generating', stale, brief };
    return brief ? { status: 'ready', stale, brief } : { status: 'none', stale: false, brief: null };
  }

  async generate(workspaceId: string, prId: string, opts: { correlationId?: string } = {}): Promise<PrBriefResponse> {
    const ctx = await this.requirePull(workspaceId, prId);
    const files = await this.deps.repo.getFiles(prId);
    if (files.length === 0) {
      throw new ConflictError('no_changes', 'The pull request has no changed files to brief');
    }
    // Check-and-set with no `await` in between, so two requests cannot both pass.
    if (this.inflight.has(prId)) throw new ConflictError('generation_in_progress', 'A brief is already being generated');
    this.inflight.add(prId);
    try {
      const brief = await this.run(workspaceId, prId, ctx, files, opts.correlationId);
      return { status: 'ready', stale: false, brief };
    } finally {
      this.inflight.delete(prId);
    }
  }

  // ---- internals -----------------------------------------------------------

  private async requirePull(workspaceId: string, prId: string) {
    const ctx = await this.deps.repo.findPull(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');
    return ctx;
  }

  private async run(
    workspaceId: string,
    prId: string,
    ctx: NonNullable<Awaited<ReturnType<BriefRepository['findPull']>>>,
    files: Awaited<ReturnType<BriefRepository['getFiles']>>,
    correlationId: string | undefined,
  ): Promise<PrBrief> {
    const t0 = Date.now();
    let choice: FeatureModelChoice;
    let llm: LLMProvider;
    try {
      choice = await this.deps.resolveModel(workspaceId, 'risk_brief');
      llm = await this.deps.llm(choice.provider);
    } catch (err) {
      if (isConfigError(err)) throw new AppError('config_error', reasonOf(err), 400);
      throw err;
    }
    const modelLabel = `${choice.provider}/${choice.model}`;
    const headSha = ctx.pull.headSha;

    let llmCalls: 0 | 1 = 0;
    let inputTokens = 0;
    let usage: { tokensIn: number; tokensOut: number; costUsd: number | null } = { tokensIn: 0, tokensOut: 0, costUsd: null };
    let missingKinds: string[] = [];
    try {
      const gathered = await this.gather(workspaceId, prId, ctx, files);
      missingKinds = gathered.missing.map((m) => m.input);

      const prompt = buildRiskBriefPrompt(gathered.facts, (text) => this.deps.tokenizer.count(text));
      inputTokens = prompt.tokens;
      // Counts and section names only — never prompt text, description or repo content.
      this.deps.log.info(
        {
          event: 'prompt.assembled',
          call: RISK_BRIEF_CALL_NAME,
          model: modelLabel,
          ...(correlationId ? { correlation_id: correlationId } : {}),
          sections: prompt.components.map((c) => ({ name: c.name, source: c.source, chars: c.chars })),
          total_chars: prompt.messages.reduce((n, m) => n + m.content.length, 0),
          est_tokens: prompt.tokens,
        },
        `brief: prompt components — ${prompt.components.map((c) => `${c.name} ${c.chars}ch`).join(', ')}; ≈${prompt.tokens} tokens`,
      );

      const timeoutMs = this.deps.llmTimeoutMs ?? LLM_TIMEOUT_MS;
      llmCalls = 1;
      // The bound-free wire schema goes to the provider (strict json_schema can reject
      // maxLength/minItems); the AC-17 bounds are enforced right after, never re-prompted (D7).
      const result = await withTimeout(
        llm.completeStructured({
          model: choice.model,
          schema: BriefLlmOutputWire,
          schemaName: RISK_BRIEF_SCHEMA_NAME,
          messages: prompt.messages,
          singleAttempt: true,
          maxRetries: 0,
          timeoutMs,
          requireParameters: true,
          sessionId: `${ctx.repo.owner}/${ctx.repo.name}#${ctx.pull.number}:brief`,
        }),
        timeoutMs + BACKSTOP_GRACE_MS,
      );
      usage = { tokensIn: result.tokensIn, tokensOut: result.tokensOut, costUsd: result.costUsd };

      const bounded = BriefLlmOutput.safeParse(result.data);
      if (!bounded.success) {
        throw new Error(`model output violates the brief bounds: ${bounded.error.issues.map((i) => i.path.join('.')).join(', ')}`);
      }
      const allowed = [...files.map((f) => normalizeRepoPath(f.path)), ...blastFiles(gathered.facts.blast)];
      const grounded = groundBrief(bounded.data, allowed);

      const durationMs = Date.now() - t0;
      const inputs: BriefInputs = {
        missing: gathered.missing,
        truncated: prompt.truncated,
        skipped: gathered.skipped,
        notes: gathered.notes,
        input_tokens: prompt.tokens,
      };
      const brief: PrBrief = {
        intent: null,
        blast: null,
        history: null,
        risks: { risks: grounded.risks },
        summary: bounded.data.summary,
        review_focus: grounded.review_focus,
        head_sha: headSha,
        generated_at: new Date().toISOString(),
        model: modelLabel,
        usage: {
          llm_calls: 1,
          tokens_in: usage.tokensIn,
          tokens_out: usage.tokensOut,
          cost_usd: usage.costUsd,
          duration_ms: durationMs,
        },
        inputs,
        dropped_items: grounded.dropped,
      };
      await this.deps.repo.saveBrief(prId, brief);
      this.logResult({ prId, headSha, ok: true, llmCalls, inputTokens, usage, modelLabel, durationMs, dropped: grounded.dropped, missing: missingKinds });
      return brief;
    } catch (err) {
      if (llmCalls === 1 && usage.tokensIn === 0 && usage.tokensOut === 0) usage = usageFromError(err);
      const reason = reasonOf(err);
      this.logResult({ prId, headSha, ok: false, llmCalls, inputTokens, usage, modelLabel, durationMs: Date.now() - t0, dropped: 0, missing: missingKinds }, reason);
      throw new AppError('brief_generation_failed', reason, 502);
    }
  }

  private logResult(
    f: {
      prId: string;
      headSha: string;
      ok: boolean;
      llmCalls: 0 | 1;
      inputTokens: number;
      usage: { tokensIn: number; tokensOut: number; costUsd: number | null };
      modelLabel: string;
      durationMs: number;
      dropped: number;
      missing: string[];
    },
    reason?: string,
  ): void {
    this.deps.log.info(
      { event: 'brief.generated', prId: f.prId, ok: f.ok, ...(reason ? { reason } : {}) },
      formatBriefLog({
        prId: f.prId,
        headSha: f.headSha,
        ok: f.ok,
        llmCalls: f.llmCalls,
        inputTokens: f.inputTokens,
        tokensIn: f.usage.tokensIn,
        tokensOut: f.usage.tokensOut,
        costUsd: f.usage.costUsd,
        model: f.modelLabel,
        durationMs: f.durationMs,
        dropped: f.dropped,
        missing: f.missing,
      }),
    );
  }

  /** Every fact the model may see, fail-soft: a source that cannot be read becomes a missing-input entry. */
  private async gather(
    workspaceId: string,
    prId: string,
    ctx: NonNullable<Awaited<ReturnType<BriefRepository['findPull']>>>,
    files: Awaited<ReturnType<BriefRepository['getFiles']>>,
  ): Promise<Gathered> {
    const missing: BriefMissingInput[] = [];
    const notes: string[] = [];
    const skipped: string[] = [];

    const description = (ctx.pull.body ?? '').trim();
    if (description.length === 0) missing.push({ input: 'description', reason: 'The pull request description is empty' });

    const [intentRes, blastRes, issueRes, specs] = await Promise.all([
      this.deps.intent(workspaceId, prId).then(
        (v) => ({ ok: true as const, v }),
        (e: unknown) => ({ ok: false as const, e }),
      ),
      this.deps.blast(workspaceId, prId).then(
        (v) => ({ ok: true as const, v }),
        (e: unknown) => ({ ok: false as const, e }),
      ),
      this.deps.linkedIssue(workspaceId, prId).catch(
        (e: unknown): BriefLinkedIssue => ({ status: 'missing', reason: reasonOf(e) }),
      ),
      this.readSpecs(workspaceId, ctx.repo.clonePath, missing, notes, skipped),
    ]);

    let intent: Intent | null = null;
    if (!intentRes.ok) {
      missing.push({ input: 'intent', reason: `Intent unavailable: ${reasonOf(intentRes.e)}` });
    } else if (!intentRes.v) {
      missing.push({ input: 'intent', reason: 'No intent has been derived for this pull request' });
    } else {
      const r = intentRes.v;
      intent = { intent: r.intent, in_scope: r.in_scope, out_of_scope: r.out_of_scope, risk_areas: r.risk_areas ?? null };
      if (r.stale) notes.push('intent may be outdated');
    }

    let blast: BlastRadius | null = null;
    if (!blastRes.ok) {
      missing.push({ input: 'blast', reason: `blast radius unavailable: ${reasonOf(blastRes.e)}` });
    } else {
      blast = blastRes.v;
      if (blast.degraded) notes.push('blast radius partial');
    }

    let issue: BriefFacts['issue'] = null;
    if (issueRes.status === 'ok') issue = { title: issueRes.issue.title, body: issueRes.issue.body ?? '' };
    else missing.push({ input: 'linked_issue', reason: issueRes.reason });

    return {
      facts: {
        title: ctx.pull.title,
        description: description.length > 0 ? description : null,
        issue,
        intent,
        blast,
        files: toDiffStats(files),
        specs,
      },
      missing,
      skipped,
      notes,
    };
  }

  /** Attached project docs read through the safe reader; an unreadable doc is skipped, never fatal. */
  private async readSpecs(
    workspaceId: string,
    clonePath: string | null,
    missing: BriefMissingInput[],
    notes: string[],
    skipped: string[],
  ): Promise<{ path: string; text: string }[]> {
    let paths: string[];
    try {
      paths = await this.deps.repo.attachedDocPaths(workspaceId);
    } catch (err) {
      missing.push({ input: 'specs', reason: `Specs unavailable: ${reasonOf(err)}` });
      return [];
    }
    if (paths.length === 0) {
      missing.push({ input: 'specs', reason: 'No project docs are attached to any enabled agent' });
      return [];
    }
    if (!clonePath || !(await this.deps.docs.exists(clonePath))) {
      notes.push('repository not cloned');
      skipped.push(...paths);
      return [];
    }
    const out: { path: string; text: string }[] = [];
    for (const p of paths) {
      try {
        const r = await this.deps.docs.read(clonePath, p);
        if (r.status === 'ok') out.push({ path: p, text: r.text });
        else skipped.push(p);
      } catch {
        skipped.push(p);
      }
    }
    return out;
  }
}
