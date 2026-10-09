import type {
  EvalCaseMeta,
  EvalCaseResult,
  EvalExpectation,
  LLMProvider,
  Provider,
  UnifiedDiff,
} from '@devdigest/shared';
import type { PromptSkill, ReviewStrategy } from '@devdigest/reviewer-core';
import type { PinoLike } from '../../platform/run-logger.js';
import type { RunScore } from './scoring.js';

/** The config an eval run executes against — captured once when the run starts. */
export interface EvalRunSnapshot {
  runId: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy | null;
  /** Enabled linked skills, already gated + ordered; empty when the agent has none. */
  skills: PromptSkill[];
}

/** A case as the executor sees it: the frozen input only. */
export interface EvalRunnableCase {
  id: string;
  name: string;
  /** Frozen single-file unified diff (`eval_cases.input_diff`). */
  inputDiff: string;
  expectation: EvalExpectation;
  meta: EvalCaseMeta;
}

/** Terminal write of a run. `completed` even when cases errored (D5); `errored` is run-level only. */
export interface EvalRunFinish {
  status: 'completed' | 'errored';
  score: RunScore;
  results: EvalCaseResult[];
  durationMs: number;
  errorReason?: string | null;
}

/** Persistence the executor needs — the run row, nothing else. */
export interface EvalRunStore {
  /** Progress is a counter only; the per-case results are written once, by `finish`. */
  markProgress(runId: string, progress: { casesDone: number }): Promise<void>;
  finish(runId: string, outcome: EvalRunFinish): Promise<void>;
}

/**
 * Everything the executor may touch. There is deliberately no git, GitHub, repo-intel or intent
 * member: a case runs on its frozen input only (AC-4, AC-15). The diff parser is injected so this
 * module imports no adapter.
 */
export interface EvalExecutorDeps {
  llm: (provider: Provider) => Promise<LLMProvider>;
  parseDiff: (raw: string) => UnifiedDiff;
  store: EvalRunStore;
  log: PinoLike;
  now: () => number;
  /** One id on every log line of a run. */
  correlationId: string;
  /** Per-case timeout override (defaults to CASE_TIMEOUT_MS). */
  caseTimeoutMs?: number;
}
