import type {
  FeatureModelChoice,
  FeatureModelId,
  GitHubClient,
  IntentSource,
  LLMProvider,
  PrIntentRecord,
  Provider,
} from '@devdigest/shared';
import {
  buildIntentPrompt,
  computeIntentConfidence,
  deriveIntent,
  meaningfulChars,
  type IntentPromptInput,
  type LoadedIntentSource,
  type UnavailableIntentSource,
} from '@devdigest/reviewer-core';
import type { PullRow } from '../../db/rows.js';
import type { TicketFetcher } from '../../adapters/tickets/index.js';
import type { RepoFileReader } from '../../adapters/git/repo-file-reader.js';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import type { PinoLike, RunLogger } from '../../platform/run-logger.js';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import type { IntentRepository } from './repository.js';
import {
  CLASSIFIER_TIMEOUT_MS,
  MAX_DESCRIPTION_CHARS,
  MAX_FILE_CHARS,
  MAX_FILES,
  MAX_HUNK_HEADERS,
  MAX_ISSUE_CHARS,
  MAX_TICKET_CHARS,
  MAX_TITLE_CHARS,
  SOURCE_TIMEOUT_MS,
} from './constants.js';
import {
  buildMissingContext,
  capText,
  extractHunkHeaders,
  extractReferences,
  inputHash,
  isSafeRepoPath,
  isStale,
  redactSecrets,
  stripHtmlComments,
  summarizeSources,
  toPrIntentDto,
  unavailableReason,
} from './helpers.js';

type RepoRow = NonNullable<Awaited<ReturnType<IntentRepository['getRepo']>>>;

/** Narrow dependencies (no `Container` locator) — wired in `platform/container.ts`. */
export interface IntentServiceDeps {
  repo: IntentRepository;
  github: () => Promise<GitHubClient>;
  repoFiles: RepoFileReader;
  /** Optional: without it every ticket link is recorded as `blocked`. */
  tickets?: TicketFetcher;
  llm: (provider: Provider) => Promise<LLMProvider>;
  resolveModel: (workspaceId: string, id: FeatureModelId) => Promise<FeatureModelChoice>;
  tokenizer: Tokenizer;
  /** Default pino-like sink; per-call `opts.log` overrides it. */
  log?: PinoLike;
  classifierTimeoutMs?: number;
}

export interface IntentRunOpts {
  /** Full diff text of the run (hunk headers are taken from it); else `pr_files.patch`. */
  diffRaw?: string;
  /** Live Log of the review run; absent for the manual re-run (pino only). */
  runLog?: RunLogger;
  log?: PinoLike;
  /** Request id shared with the review's logs; echoed in the structured prompt/classifier lines. */
  correlationId?: string;
}

export interface IntentEnsureResult {
  record: PrIntentRecord | null;
  /** `derived` = classifier ran now; `cached` = existing row reused; `failed` = fail-soft. */
  origin: 'derived' | 'cached' | 'failed';
  ms: number;
  /** provider/model of the classifier call (only when it ran). */
  model: string | null;
  failure: string | null;
}

class ClassifierTimeoutError extends Error {
  constructor(ms: number) {
    super(`intent classifier timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/** OpenRouter ignores `timeoutMs`, so a hung call is abandoned here. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ClassifierTimeoutError(ms)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

const short = (sha: string) => sha.slice(0, 7);

/**
 * Intent layer use cases: derive (classifier call), get, and the fail-soft
 * pre-work the review run calls. One `pr_intent` row per PR. The intent call is
 * NOT an `agent_run` — its usage lives on the row (spec D4).
 */
export class IntentService {
  /** In-flight derivations keyed `prId:headSha` (double click / review + re-run share one call). */
  private inflight = new Map<string, Promise<PrIntentRecord>>();

  constructor(private deps: IntentServiceDeps) {}

  /** GET: the stored intent with `stale` computed against the PR as it is now; null if never derived. */
  async get(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const pull = await this.requirePull(workspaceId, prId);
    const row = await this.deps.repo.getIntent(workspaceId, prId);
    if (!row) return null;
    const files = await this.deps.repo.getPrFiles(prId);
    return toPrIntentDto(row, isStale(row, pull, inputHash({ ...pull, files })));
  }

  /** POST: force a (re-)derivation. Errors surface (502 LLM failure, 400 missing key). */
  async derive(workspaceId: string, prId: string, opts: IntentRunOpts = {}): Promise<PrIntentRecord> {
    const pull = await this.requirePull(workspaceId, prId);
    const repo = await this.requireRepo(pull);
    try {
      const { provider, model } = await this.deps.resolveModel(workspaceId, 'review_intent');
      return await this.classify(workspaceId, pull, repo, { provider, model }, opts);
    } catch (err) {
      throw this.toApiError(err);
    }
  }

  /**
   * Review-run pre-work. Derives only when NO intent exists; an existing intent
   * is reused even when stale (flagged in the log — the user re-runs it from the
   * PR page). NEVER throws: an intent failure must not fail the review.
   */
  async ensureForReview(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    opts: IntentRunOpts = {},
  ): Promise<IntentEnsureResult> {
    const t0 = Date.now();
    const log = opts.log ?? this.deps.log;
    const say = (msg: string) => opts.runLog?.info(msg);
    let model: string | null = null;
    try {
      const existing = await this.deps.repo.getIntent(workspaceId, pull.id);
      if (existing) {
        const files = await this.deps.repo.getPrFiles(pull.id);
        const stale = isStale(existing, pull, inputHash({ ...pull, files }));
        say(
          stale
            ? `intent: reusing STALE intent (derived at ${short(existing.headSha ?? '?')}, PR now at ${short(pull.headSha)}) — re-run it from the PR page`
            : `intent: reusing fresh intent (head ${short(pull.headSha)})`,
        );
        return { record: toPrIntentDto(existing, stale), origin: 'cached', ms: Date.now() - t0, model: null, failure: null };
      }

      const choice = await this.deps.resolveModel(workspaceId, 'review_intent');
      model = `${choice.provider}/${choice.model}`;
      const run = () => this.classify(workspaceId, pull, repo, choice, opts);
      const record = opts.runLog
        ? await opts.runLog.step(`Intent classifier (${model})`, run, { kind: 'tool' })
        : await run();
      return { record, origin: 'derived', ms: Date.now() - t0, model, failure: null };
    } catch (err) {
      const failure = redactSecrets((err as Error)?.message ?? 'unknown error');
      say(`intent: failed — ${failure}; reviewing without intent`);
      log?.warn({ event: 'intent.failed', prId: pull.id, model, err: failure }, 'intent: classifier failed; reviewing without intent');
      return { record: null, origin: 'failed', ms: Date.now() - t0, model, failure };
    }
  }

  // ---- internals -----------------------------------------------------------

  private async requirePull(workspaceId: string, prId: string): Promise<PullRow> {
    const pull = await this.deps.repo.getPullForWorkspace(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  private async requireRepo(pull: PullRow): Promise<RepoRow> {
    const repo = await this.deps.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  /** Missing key → 400, anything else from the model call → 502; both redacted. */
  private toApiError(err: unknown): Error {
    if (err instanceof AppError && err.code === 'config_error') {
      return new AppError('config_error', redactSecrets(err.message), 400);
    }
    if (err instanceof AppError) return err;
    return new ExternalServiceError(`Intent classifier failed: ${redactSecrets((err as Error)?.message ?? 'unknown error')}`);
  }

  /** Dedupes concurrent derivations of the same PR inputs. */
  private classify(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    choice: FeatureModelChoice,
    opts: IntentRunOpts,
  ): Promise<PrIntentRecord> {
    const key = `${pull.id}:${pull.headSha}`;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = this.classifyOnce(workspaceId, pull, repo, choice, opts).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async classifyOnce(
    _workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    choice: FeatureModelChoice,
    opts: IntentRunOpts,
  ): Promise<PrIntentRecord> {
    const t0 = Date.now();
    const log = opts.log ?? this.deps.log;
    const say = (msg: string) => opts.runLog?.info(msg);
    const repoRef = { owner: repo.owner, name: repo.name };

    // ---- gather inputs (metadata only: never diff bodies) ------------------
    const files = await this.deps.repo.getPrFiles(pull.id);
    const hash = inputHash({ ...pull, files });
    const description = stripHtmlComments(pull.body ?? '').trim();
    const hunkHeaders = extractHunkHeaders(
      opts.diffRaw ?? files.map((f) => f.patch ?? '').join('\n'),
    );
    const promptFiles = files.slice(0, MAX_FILES).map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
    }));

    const sources: IntentSource[] = [];
    const loaded: LoadedIntentSource[] = [];
    const unavailable: UnavailableIntentSource[] = [];

    sources.push({ kind: 'pr_title', ref: 'title', status: pull.title.length > MAX_TITLE_CHARS ? 'truncated' : 'used', chars: Math.min(pull.title.length, MAX_TITLE_CHARS) });
    sources.push(
      description.length === 0
        ? { kind: 'pr_description', ref: 'description', status: 'missing', reason: 'empty', chars: 0 }
        : {
            kind: 'pr_description',
            ref: 'description',
            status: description.length > MAX_DESCRIPTION_CHARS ? 'truncated' : 'used',
            chars: Math.min(description.length, MAX_DESCRIPTION_CHARS),
          },
    );
    sources.push(
      files.length === 0
        ? { kind: 'file_list', ref: 'files', status: 'missing', reason: 'file list not loaded — open the PR once', chars: 0 }
        : {
            kind: 'file_list',
            ref: `${files.length} files`,
            status: files.length > MAX_FILES ? 'truncated' : 'used',
            chars: promptFiles.reduce((n, f) => n + f.path.length, 0),
          },
    );
    sources.push(
      hunkHeaders.length === 0
        ? { kind: 'hunk_headers', ref: 'hunks', status: 'missing', reason: 'no hunk headers', chars: 0 }
        : {
            kind: 'hunk_headers',
            ref: `${hunkHeaders.length} hunks`,
            status: hunkHeaders.length >= MAX_HUNK_HEADERS ? 'truncated' : 'used',
            chars: hunkHeaders.reduce((n, h) => n + h.length, 0),
          },
    );

    const refs = extractReferences(`${pull.title}\n${description}`, repoRef);
    const record = (
      s: { kind: 'github_issue' | 'repo_file' | 'external_ticket'; ref: string },
      r: { text: string } | { status: 'missing' | 'blocked'; reason: string },
      cap: number,
    ) => {
      if ('status' in r) {
        const reason = redactSecrets(r.reason).slice(0, 120);
        sources.push({ ...s, status: r.status, reason, chars: 0 });
        unavailable.push({ ...s, status: r.status, reason });
        return;
      }
      const body = stripHtmlComments(r.text).trim();
      const c = capText(body, cap);
      sources.push({ ...s, status: c.truncated ? 'truncated' : 'used', chars: c.text.length });
      loaded.push({ ...s, text: c.text });
    };

    await Promise.all([
      ...refs.issues.map(async (i) => {
        const s = { kind: 'github_issue' as const, ref: i.ref };
        try {
          const gh = await this.deps.github();
          const issue = await withTimeout(gh.getIssue({ owner: i.owner, name: i.name }, i.number), SOURCE_TIMEOUT_MS);
          record(s, { text: `${issue.title}\n\n${issue.body ?? ''}` }, MAX_ISSUE_CHARS);
        } catch (err) {
          record(s, { status: 'missing', reason: unavailableReason(err) }, 0);
        }
      }),
      ...refs.files.map(async (f) => {
        const s = { kind: 'repo_file' as const, ref: f.ref };
        if (!isSafeRepoPath(f.path)) return record(s, { status: 'blocked', reason: 'unsafe path' }, 0);
        try {
          const res = await withTimeout(
            this.deps.repoFiles.read(repoRef, f.path, [pull.headSha, 'HEAD']),
            SOURCE_TIMEOUT_MS,
          );
          record(s, res.status === 'ok' ? { text: res.text } : res, MAX_FILE_CHARS);
        } catch (err) {
          record(s, { status: 'missing', reason: unavailableReason(err) }, 0);
        }
      }),
      ...refs.tickets.map(async (tk) => {
        const s = { kind: 'external_ticket' as const, ref: tk.ref };
        if (!this.deps.tickets) return record(s, { status: 'blocked', reason: 'external trackers not configured' }, 0);
        try {
          const res = await withTimeout(this.deps.tickets.fetch({ host: tk.host, key: tk.key }), SOURCE_TIMEOUT_MS);
          record(s, 'error' in res ? { status: res.error, reason: res.reason } : { text: `${res.title}\n\n${res.body}` }, MAX_TICKET_CHARS);
        } catch (err) {
          record(s, { status: 'missing', reason: unavailableReason(err) }, 0);
        }
      }),
    ]);
    for (const b of refs.blocked) record({ kind: b.kind, ref: b.ref }, { status: 'blocked', reason: b.reason }, 0);

    // ---- prompt + observability (counts and refs only) ---------------------
    const input: IntentPromptInput = {
      prNumber: pull.number,
      title: pull.title,
      description,
      files: promptFiles,
      hunkHeaders,
      sources: loaded,
      unavailable,
    };
    const { messages, components } = buildIntentPrompt(input);
    const estTokens = this.deps.tokenizer.count(messages.map((m) => m.content).join('\n'));
    const modelLabel = `${choice.provider}/${choice.model}`;
    say(`intent: sources — ${summarizeSources(sources)}`);
    // Structured prompt log: section names (redacted), who produced each, and sizes.
    // Never the text. In a review this goes through the run logger (Live Log + pino);
    // for the manual re-run there is no run, so it goes straight to pino.
    const promptLog = {
      event: 'prompt.assembled',
      call: 'intent_classifier',
      model: modelLabel,
      ...(opts.correlationId ? { correlation_id: opts.correlationId } : {}),
      sections: components.map((c) => ({ name: redactSecrets(c.name), source: c.source, chars: c.chars })),
      total_chars: messages.reduce((n, m) => n + m.content.length, 0),
      est_tokens: estTokens,
    };
    const promptMsg = `intent: prompt components — ${components.map((c) => `${redactSecrets(c.name)} ${c.chars}ch`).join(', ')}; est ≈${estTokens.toLocaleString('en-US')} tokens (tiktoken)`;
    if (opts.runLog) opts.runLog.info(promptMsg, promptLog);
    else log?.info(promptLog, promptMsg);

    // ---- CALL 1: the classifier ---------------------------------------------
    const llm = await this.deps.llm(choice.provider);
    const timeoutMs = this.deps.classifierTimeoutMs ?? CLASSIFIER_TIMEOUT_MS;
    const result = await withTimeout(
      deriveIntent({
        llm,
        model: choice.model,
        input,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:intent`,
      }),
      timeoutMs,
    );

    const confidence = computeIntentConfidence(sources, meaningfulChars(description));
    const missingContext = buildMissingContext(sources);
    const durationMs = Date.now() - t0;
    const row = await this.deps.repo.upsertIntent(pull.id, {
      intent: result.intent.intent,
      inScope: result.intent.in_scope,
      outOfScope: result.intent.out_of_scope,
      riskAreas: result.intent.risk_areas ?? [],
      confidence,
      sources,
      missingContext,
      headSha: pull.headSha,
      inputHash: hash,
      provider: choice.provider,
      model: choice.model,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      costUsd: result.usage.costUsd,
      durationMs,
    });

    const cost = result.usage.costUsd == null ? 'unknown' : `$${result.usage.costUsd.toFixed(5)}`;
    say(
      `intent: done — tokens ${result.usage.tokensIn}/${result.usage.tokensOut}, cost ${cost}, confidence ${confidence}, missing_context ${missingContext.length}`,
    );
    log?.info(
      {
        event: 'intent.classify',
        ...(opts.correlationId ? { correlation_id: opts.correlationId } : {}),
        prId: pull.id,
        provider: choice.provider,
        model: choice.model,
        estTokens,
        sources: sources.map((s) => ({ kind: s.kind, ref: s.ref, status: s.status })),
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        costUsd: result.usage.costUsd,
        durationMs,
        confidence,
        attempts: result.attempts,
      },
      `intent: classifier call (${modelLabel})`,
    );
    return toPrIntentDto(row, false);
  }
}
