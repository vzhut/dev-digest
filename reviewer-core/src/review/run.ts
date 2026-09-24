import type {
  Finding,
  LLMProvider,
  PromptAssembly,
  Review,
  RunEventKind,
  UnifiedDiff,
} from '@devdigest/shared';
import { Review as ReviewSchema } from '@devdigest/shared';
import { assemblePrompt, type AssembledPrompt, type PromptSkill } from '../prompt.js';
import { groundFindings, groundingSummary } from '../grounding.js';
import { annotateDiff } from '../diff-annotate.js';
import { applyIntentScope, type ScopedFinding, type ScopeStats } from '../intent/scope.js';
import type { ReviewIntent } from '../intent/types.js';
import { reduceReviews, scoreFromFindings, sliceDiff, verdictFromFindings } from './reduce.js';

/**
 * reviewPullRequest — the review engine entry point.
 *
 * given (diff + resolved agent inputs + injected LLM) → grounded Review.
 *
 * This is the pure core lifted out of the server's `ReviewService.runOneAgent`:
 * assemble prompt → single-pass OR map-reduce per file → reduce → SHARED
 * citation-grounding gate. It performs NO I/O beyond the injected LLM provider
 * (no DB, GitHub, fs, memory retrieval, intent, or persistence) — those stay in
 * the caller (server persists + streams SSE; runner posts + writes an artifact).
 *
 * Skill bodies / memory / specs are RESOLVED strings here: the caller turns
 * AgentManifest skill slugs into bodies (DB in the studio, fs in the runner).
 */

/** Default map-reduce threshold (matches the server's FILE_MAP_THRESHOLD_LINES). */
export const DEFAULT_MAP_THRESHOLD_LINES = 400;
/** Default structured-output reprompt retries (matches REVIEW_MAX_RETRIES). */
export const DEFAULT_REVIEW_MAX_RETRIES = 2;

export type ReviewStrategy = 'auto' | 'single-pass' | 'map-reduce';
export type ReviewMode = 'single-pass' | 'map-reduce';

/** Progress event emitted during a review (server → SSE bus, runner → log). */
export interface ReviewEvent {
  kind: RunEventKind;
  msg: string;
  data?: unknown;
}

export interface ReviewInput {
  /** Agent system prompt (trusted). */
  systemPrompt: string;
  /** Model id understood by the injected provider (e.g. 'deepseek/deepseek-v4-flash'). */
  model: string;
  /** The PR's unified diff (already parsed; hunks carry new-side line numbers). */
  diff: UnifiedDiff;
  /** Injected LLM provider (OpenRouter in CI, OpenAI/Anthropic in the studio). */
  llm: LLMProvider;
  /** 'auto' (default) picks single-pass unless the diff is large + multi-file. */
  strategy?: ReviewStrategy;
  /** Resolved skill bodies (NOT slugs). */
  skills?: PromptSkill[];
  /** Curated memory items. */
  memory?: string[];
  /** Project-context spec chunks (untrusted; delimiter-wrapped downstream). */
  specs?: string[];
  /**
   * Optional callers-of-changed-symbols digest (T1.3). Untrusted; rendered
   * before the diff section. Empty/undefined → section omitted.
   */
  callers?: string;
  /**
   * Optional repo skeleton / map (T3). Untrusted; rendered before the project
   * context section. Empty/undefined → section omitted.
   */
  repoMap?: string;
  /** PR author's description/body (untrusted; truncated + delimiter-wrapped in
      the prompt). Empty/undefined → section omitted. */
  prDescription?: string;
  /**
   * Derived PR intent (from the intent classifier). Injected into the prompt as
   * its own untrusted section and used by `applyIntentScope` after grounding.
   * Undefined → prompt and findings are exactly as without the intent layer.
   */
  intent?: ReviewIntent;
  /** Task framing line, e.g. "Review PR #482 …". */
  task?: string;
  /** Override the structured-output retry budget. */
  maxRetries?: number;
  /** Override the map-reduce line threshold. */
  mapThresholdLines?: number;
  /**
   * OpenRouter session id — forwarded on every LLM call so all chunks of this
   * review group into one session in the OpenRouter dashboard.
   */
  sessionId?: string;
  /** Progress sink. */
  onEvent?: (e: ReviewEvent) => void;
  /**
   * Correlates every log line of one review request (the server's request id).
   * Echoed in the `prompt.assembled` events; never used for anything else.
   */
  correlationId?: string;
  /** Injected token estimator for the prompt log (keeps the engine free of a tokenizer). */
  countTokens?: (text: string) => number;
  /**
   * Also emit a per-section `prompt.assembled.detail` event (tokens per section, cap
   * details). Off by default; the server enables it for local development only.
   */
  promptLogDetail?: boolean;
  /**
   * Cancellation checkpoint, called before each (expensive) chunk LLM call.
   * Supply a function that THROWS to abort mid-run (the caller owns the error
   * type, e.g. the server's RunCancelledError); the engine stays agnostic.
   */
  checkCancelled?: () => void;
}

/** A Review whose findings went through the intent scope policy. */
export type ScopedReview = Omit<Review, 'findings'> & { findings: ScopedFinding[] };

export interface ReviewOutcome {
  /** The reduced, GROUNDED, scope-adjusted review (findings that survived the citation gate). */
  review: ScopedReview;
  /** Out-of-scope tag/downgrade counts (all zero without an intent). */
  scoped: ScopeStats;
  /** Human-readable grounding summary, e.g. "3/4 passed". */
  grounding: string;
  /** Findings dropped by grounding, with reasons (for logs / "never go silent"). */
  dropped: { finding: Finding; reason: string }[];
  /** Which path ran. */
  mode: ReviewMode;
  /** Prompt assembly (for the run trace). Single-pass: the one call; map-reduce: the whole-diff assembly. */
  assembly: PromptAssembly;
  /** Per-chunk labels (for the run trace's tool_calls). */
  chunks: { label: string }[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** Joined raw model outputs (for the run trace). */
  raw: string;
}

function selectMode(strategy: ReviewStrategy, diff: UnifiedDiff, threshold: number): ReviewMode {
  if (strategy === 'single-pass') return 'single-pass';
  if (strategy === 'map-reduce') return diff.files.length > 1 ? 'map-reduce' : 'single-pass';
  // auto: map-reduce only when the diff is both large AND multi-file (else 1 call).
  const totalLines = diff.files.reduce((n, f) => n + f.additions + f.deletions, 0);
  return totalLines > threshold && diff.files.length > 1 ? 'map-reduce' : 'single-pass';
}

interface PromptLogContext {
  call: 'review';
  chunk: string;
  model: string;
  correlationId: string | undefined;
  countTokens: ((text: string) => number) | undefined;
  detail: boolean;
}

/**
 * Describe a just-assembled prompt for the run log: which sections, where each
 * came from, how big, and which model gets it. Metadata ONLY — section text
 * (the diff, specs, PR body, skills) never reaches an event. The optional
 * `.detail` event adds per-section tokens and cap details for local debugging.
 */
function emitPromptAssembled(
  emit: (kind: RunEventKind, msg: string, data?: unknown) => void,
  a: AssembledPrompt,
  ctx: PromptLogContext,
): void {
  const totalChars = a.messages.reduce((n, m) => n + m.content.length, 0);
  const estTokens = ctx.countTokens
    ? ctx.countTokens(a.messages.map((m) => m.content).join('\n'))
    : undefined;
  const ids = {
    call: ctx.call,
    chunk: ctx.chunk,
    model: ctx.model,
    ...(ctx.correlationId ? { correlation_id: ctx.correlationId } : {}),
  };
  emit(
    'info',
    `prompt: ${a.sections.map((x) => `${x.name} ${x.chars}ch`).join(', ')}; total ${totalChars}ch` +
      `${estTokens != null ? ` (≈${estTokens} tokens)` : ''} → ${ctx.model}`,
    {
      event: 'prompt.assembled',
      ...ids,
      sections: a.sections.map((x) => ({ name: x.name, source: x.source, chars: x.chars })),
      total_chars: totalChars,
      ...(estTokens != null ? { est_tokens: estTokens } : {}),
    },
  );
  if (ctx.detail) {
    emit('tool', `prompt detail: ${a.sections.length} section(s)`, {
      event: 'prompt.assembled.detail',
      ...ids,
      sections: a.sections.map((x, index) => ({ index, ...x })),
    });
  }
}

export async function reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome> {
  const threshold = input.mapThresholdLines ?? DEFAULT_MAP_THRESHOLD_LINES;
  const maxRetries = input.maxRetries ?? DEFAULT_REVIEW_MAX_RETRIES;
  const mode = selectMode(input.strategy ?? 'auto', input.diff, threshold);
  const emit = (kind: RunEventKind, msg: string, data?: unknown) =>
    input.onEvent?.({ kind, msg, data });

  const promptParts = {
    system: input.systemPrompt,
    skills: input.skills,
    memory: input.memory,
    specs: input.specs,
    callers: input.callers,
    repoMap: input.repoMap,
    prDescription: input.prDescription,
    intent: input.intent,
    task: input.task,
  };

  // Whole-diff assembly is the trace default; overwritten below for single-pass.
  let assembly: PromptAssembly = assemblePrompt({ ...promptParts, diff: annotateDiff(input.diff.raw) }).assembly;

  const chunks =
    mode === 'map-reduce'
      ? input.diff.files.map((f) => ({ label: f.path, diffText: sliceDiff(input.diff, f.path) }))
      : [{ label: 'all files', diffText: input.diff.raw }];

  emit(
    'info',
    mode === 'map-reduce'
      ? `Large diff → map-reduce over ${input.diff.files.length} files`
      : `Reviewing ${input.diff.files.length} changed file(s) in one pass`,
  );

  const partials: Review[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = 0;
  const raws: string[] = [];

  for (const chunk of chunks) {
    // Cancellation checkpoint — stop before the next (expensive) LLM call.
    input.checkCancelled?.();
    // 'map:' prefix only for the map-reduce path (one call per file). In
    // single-pass there is exactly one chunk (the whole diff) — don't mislabel it.
    emit(
      'tool',
      mode === 'map-reduce' ? `map: reviewing ${chunk.label}` : `Reviewing ${chunk.label} in one pass`,
      { file: chunk.label },
    );
    const a = assemblePrompt(
      { ...promptParts, diff: annotateDiff(chunk.diffText) },
      { countTokens: input.countTokens, detail: input.promptLogDetail },
    );
    emitPromptAssembled(emit, a, {
      call: 'review',
      chunk: chunk.label,
      model: input.model,
      correlationId: input.correlationId,
      countTokens: input.countTokens,
      detail: input.promptLogDetail === true,
    });
    if (mode === 'single-pass') assembly = a.assembly;
    const res = await input.llm.completeStructured<Review>({
      model: input.model,
      schema: ReviewSchema,
      schemaName: 'Review',
      messages: a.messages,
      maxRetries,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    });
    tokensIn += res.tokensIn;
    tokensOut += res.tokensOut;
    costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
    raws.push(res.raw);
    partials.push(res.data);
    emit('result', `${chunk.label}: ${res.data.findings.length} candidate finding(s)`);
  }

  const merged = reduceReviews(partials);
  emit(
    'result',
    `Reduced to ${merged.findings.length} finding(s); verdict=${merged.verdict}, score=${merged.score}`,
  );

  // SHARED citation-grounding gate (the only post-step; not duplicated per strategy).
  const ground = groundFindings(merged.findings, input.diff);
  const grounding = groundingSummary(ground);
  for (const d of ground.dropped) {
    emit('info', `grounding dropped "${d.finding.title}": ${d.reason}`);
  }
  emit('result', `Citation grounding: ${grounding}`);

  // Scope policy runs AFTER grounding and BEFORE score/verdict: a downgrade
  // changes severities, which the score and verdict are derived from. Never drops.
  const scoped = applyIntentScope(ground.kept, input.intent);
  if (scoped.stats.tagged > 0) {
    emit(
      'info',
      `scope: ${scoped.stats.tagged} out-of-scope finding(s) tagged, ${scoped.stats.downgraded} downgraded, ${scoped.stats.kept} kept (security/CRITICAL)`,
    );
  }

  // Score is derived from the findings that SURVIVED grounding and scoping (not
  // the model's self-reported number, and not the pre-grounding set) so the
  // score, the findings list, and the deterministic event always agree.
  return {
    review: {
      ...merged,
      findings: scoped.findings,
      score: scoreFromFindings(scoped.findings),
      verdict: verdictFromFindings(scoped.findings),
    },
    scoped: scoped.stats,
    grounding,
    dropped: ground.dropped,
    mode,
    assembly,
    chunks: chunks.map((c) => ({ label: c.label })),
    tokensIn,
    tokensOut,
    costUsd,
    raw: raws.join('\n---\n'),
  };
}
