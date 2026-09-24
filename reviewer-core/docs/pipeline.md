# Engine pipeline — step by step

Entry point: `reviewPullRequest(input)` in `src/review/run.ts:123`. Pure: the only
side effect is `input.llm.completeStructured(...)`. Diagram and public API:
`../README.md`. Scoring and grounding rules: `scoring-and-grounding.md`.

## 1. Pick a mode (`selectMode`, `run.ts:115`)

| `strategy` | Result |
|---|---|
| `single-pass` | one LLM call over the whole diff |
| `map-reduce` | one call per changed file — but a single-file diff still runs single-pass |
| `auto` (default) | map-reduce **only** when the diff is both large (> `DEFAULT_MAP_THRESHOLD_LINES` = 400 changed lines, overridable via `mapThresholdLines`) **and** multi-file; otherwise single-pass |

The server passes the agent's configured strategy (Agent editor) or the studio
default.

## 2. Assemble the prompt (`assemblePrompt`, `src/prompt.ts`)

Exactly two messages:

- **system** = the agent's `system_prompt` + `INJECTION_GUARD` (`prompt.ts:16`),
  appended verbatim on every run.
- **user** = task line, then optional sections, each omitted when empty:
  PR description (untrusted, cut to `MAX_PR_DESCRIPTION_CHARS` = 4000), skills,
  memory, repo skeleton, project context, callers of changed symbols, and the
  diff (or the file slice in map-reduce).

Everything repo- or author-derived goes through `wrapUntrusted(label, content)`
(`prompt.ts:30`) → `<untrusted source="…">…</untrusted>`. The guard tells the
model that fenced content is data, never instructions. **Do not** replace this
with keyword or denylist scanning (see `../AGENTS.md`).

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
`costUsd = null` (unpriced), the run's `costUsd` becomes `null` (`run.ts:184`)
rather than a partial sum that would under-report.

## 5. Ground (`groundFindings`, `src/grounding.ts`)

The only post-step, shared by both modes: drop every finding whose location
isn't in the diff. Dropped findings and reasons are emitted to the live log.
Rules: `scoring-and-grounding.md`.

## 6. Score and return

`review = { ...merged, findings: kept, score: scoreFromFindings(kept) }` —
verdict and summary come from the model, **findings and score do not**. The outcome also
carries `grounding` ("k/n passed"), `dropped`, `mode`, prompt `assembly`, chunk
labels, raw outputs and usage — the server persists these into the run trace.
