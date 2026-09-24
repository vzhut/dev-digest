# Engine pipeline — step by step

Entry point: `reviewPullRequest(input)` in `src/review/run.ts:137`. Pure: the only
side effect is `input.llm.completeStructured(...)`. Diagram and public API:
`../README.md`. Scoring and grounding rules: `scoring-and-grounding.md`.

## 1. Pick a mode (`selectMode`, `run.ts:129`)

| `strategy` | Result |
|---|---|
| `single-pass` | one LLM call over the whole diff |
| `map-reduce` | one call per changed file — but a single-file diff still runs single-pass |
| `auto` (default) | map-reduce **only** when the diff is both large (> `DEFAULT_MAP_THRESHOLD_LINES` = 400 changed lines, overridable via `mapThresholdLines`) **and** multi-file; otherwise single-pass |

The server passes the agent's configured strategy (Agent editor) or the studio
default.

## 2. Assemble the prompt (`assemblePrompt`, `src/prompt.ts`)

Exactly two messages:

- **system** = the agent's `system_prompt` + `INJECTION_GUARD` (`prompt.ts:18`),
  appended verbatim on every run.
- **user** = task line, then optional sections, each omitted when empty:
  PR description (untrusted, cut to `MAX_PR_DESCRIPTION_CHARS` = 4000),
  **PR intent**, skills, memory, repo skeleton, project context, callers of
  changed symbols, and the diff (or the file slice in map-reduce).

Everything repo- or author-derived goes through `wrapUntrusted(label, content)`
(`prompt.ts:32`) → `<untrusted source="…">…</untrusted>`. The guard tells the
model that fenced content is data, never instructions. **Do not** replace this
with keyword or denylist scanning (see `../AGENTS.md`).

**Intent in the prompt.** When `ReviewInput.intent` is set, `assemblePrompt` adds
a `## PR intent` section right after `## PR description` (`prompt.ts:151-152`,
built by `renderIntentSection`, `prompt.ts:58`). It holds one trusted
instruction line (`INTENT_INSTRUCTION`, `prompt.ts:48`: tag each finding's
`scope`; out-of-scope never lowers the severity of a security or correctness
defect) plus the intent text wrapped as `wrapUntrusted('intent', …)` and cut to
`MAX_INTENT_SECTION_CHARS` = 3000 (`intent/constants.ts:16`). The block is
recorded as `assembly.intent` (`prompt.ts:188`). With no intent the section is
omitted and the prompt is byte-identical to a run without the intent layer.
The intent is derived by a **separate** classifier call outside this package —
see `../../docs/intent-layer.md`. The engine only consumes the result.

**Prompt log.** `assemblePrompt` also returns `sections` (name, source, rendered
size, `untrusted`, `capped_from`): metadata only, no text. `reviewPullRequest`
emits it as a `prompt.assembled` event before each model call, with the model and
the caller's `correlationId`; `countTokens` (injected, so the package stays free of
a tokenizer) adds an estimate, and `promptLogDetail` adds per-section tokens.
Adding these options changes no byte of the prompt. See `../../docs/prompt-logging.md`.

## 3. Call the model with structured output (`src/llm/`)

- The JSON Schema is generated from the Zod `Review` contract
  (`toJsonSchema`, `structured.ts:19`) and sent as `response_format` with
  `strict: true` (OpenRouter). The output shape is therefore **not** described
  in prompt text — see `../../docs/agent-prompts/README.md`.
- `parseWithRepair` (`structured.ts:54`) parses the raw text directly, and falls
  back to extracting a fenced or balanced JSON block. It then validates with Zod. On failure it returns a
  `repromptMessage` listing the exact schema issues.
- The provider retries up to `maxRetries` (default 2 ⇒ 3 attempts,
  `openrouter.ts:61-68`), feeding the reprompt back to the model.
- Before each chunk call the engine calls `checkCancelled()`; the server throws
  `RunCancelledError` from there when the user cancels.

## 4. Reduce (`reduceReviews`, `src/review/reduce.ts`)

Single-pass: the one partial is the result. Map-reduce: findings are
concatenated, the **worst** verdict wins (`request_changes` > `comment` >
`approve`), summaries are joined. The mean of partial scores is computed but
discarded in step 6.

Usage is summed across chunks. **Cost is all-or-nothing:** if any chunk reports
`costUsd = null` (unpriced), the run's `costUsd` becomes `null`
(`run.ts:199`) rather than a partial sum that would under-report.

## 5. Ground (`groundFindings`, `src/grounding.ts`)

The only post-step, shared by both modes: drop every finding whose location
isn't in the diff. Dropped findings and reasons are emitted to the live log.
Rules: `scoring-and-grounding.md`.

## 5b. Scope (`applyIntentScope`, `src/intent/scope.ts:22`)

Runs after grounding and before scoring (`run.ts:221`), because a downgrade
changes severities and the score/verdict derive from them. Pure and
deterministic. **Tag + downgrade, never drop** — output length equals input
length (`scope.ts:20`).

| Finding (model-tagged `scope`) | Result |
|---|---|
| no intent, or intent `confidence = low` | unchanged (`scope` kept as informational) — `scope.ts:27,31` |
| `in_scope` / untagged | unchanged, `original_severity = null` |
| `out_of_scope` + `CRITICAL`, or `category = security` or `bug` | unchanged, counted in `stats.kept` (the scope claim comes from author-written text, so a defect is never downgraded for it) — `scope.ts` `PROTECTED_CATEGORIES` |
| `out_of_scope` + `WARNING` | severity → `SUGGESTION`, `original_severity = 'WARNING'` — `scope.ts:36-39` |
| `out_of_scope` + `SUGGESTION` | tag only |

The engine emits one `info` event when any finding is tagged
(`run.ts:222-227`); the counts also return as `ReviewOutcome.scoped`.
The stated intent is derived from author text, so it can demote noise but never
hides a security or CRITICAL finding (the guard says the same in prose,
`prompt.ts:18-30`).

## 6. Score and return

`review = { ...merged, findings: scoped, score: scoreFromFindings(scoped), verdict:
verdictFromFindings(scoped) }` (`run.ts:232-238`) — only the summary comes from the
model; **findings, score and verdict do not**. The outcome also
carries `grounding` ("k/n passed"), `scoped`, `dropped`, `mode`, prompt `assembly`, chunk
labels, raw outputs and usage — the server persists these into the run trace.
