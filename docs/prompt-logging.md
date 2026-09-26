# Prompt logging — what is logged when a prompt is built

Every model call the studio makes for a review logs **how its prompt was put
together**: which sections, who produced each, how big, which model, and one
correlation id. It never logs what the prompt says.

## What a log entry holds

One `prompt.assembled` event per model call, for both calls of a review
(see [`intent-layer.md`](intent-layer.md) for the two calls):

```jsonc
{
  "event": "prompt.assembled",
  "call": "review",                 // or "intent_classifier"
  "model": "gpt-4.1",               // classifier: "openrouter/deepseek/deepseek-v4-flash"
  "correlation_id": "0b6f…-uuid",   // the POST request id; same for the classifier and every agent of that request
  "chunk": "all files",             // review only: the file (map-reduce) or "all files"
  "sections": [ { "name": "diff", "source": "git-diff", "chars": 5751 } /* … */ ],
  "total_chars": 7420,
  "est_tokens": 1954                 // estimate (tiktoken); omitted when no counter is injected
}
```

| Section | `source` |
|---|---|
| `system` | `agent-prompt` (classifier: `classifier-prompt`) |
| `task` | `server` |
| `pr_description` | `pr-author` (`capped_from` when truncated, in detail mode) |
| `intent` | `intent-classifier` |
| `skills` / `memory` | `skill-store` / `memory-store` |
| `repo_map` / `callers` | `repo-intel` |
| `specs` | `project-specs` |
| `diff` | `git-diff` |

Classifier sections (`PR title`, `PR description`, `Changed files`, `Hunk headers`,
`Linked source <ref>`, `Unavailable context`) use the sources `pr-author`,
`git-metadata`, the linked source's kind, and `intent-resolver`.

## What is never logged

Section text: the diff, PR body, specs, skills, memory, callers, repo map, the
derived intent, tickets or issues. Only names, sources and sizes. Section names
that contain a source reference pass through `redactSecrets` first. This is
pinned by tests that put marker strings in every section and fail if any appears
in a log payload (`reviewer-core/test/prompt-log.test.ts`,
`server/test/review-intent-run.it.test.ts`).

## Where it goes

The engine (`reviewer-core`, pure) builds the metadata in `assemblePrompt`
(`src/prompt.ts:131,163`, `describe`) and emits it from `emitPromptAssembled`
(`src/review/run.ts:164`, called at `:254`). The server adds the model's
correlation id and a tokenizer, and the run logger fans the event out three ways:
the Live Log (SSE), the persisted `run_traces.log`, and pino stdout.

- `run_traces.log` keeps only `{t, msg, kind}`: the human line
  `prompt: system 1377ch, task 61ch, … total 7420ch (≈1954 tokens) → gpt-4.1`
  survives a reload, the structured `data` does not. For the structured form read
  stdout (pino) or watch the Live Log while the run is live.
- The correlation id is Fastify's request id, now a UUID per request
  (`server/src/app.ts:50`, `genReqId`). It is a top-level `correlation_id` on
  run-logger lines, and `reqId` on the request-scoped lines. The classifier line
  is `event: intent.classify` (`modules/intent/service.ts:407`).

## Verbose mode (local only)

`PROMPT_LOG_VERBOSE=true` adds one more event, `prompt.assembled.detail`
(kind `tool` → pino `debug`), with per-section `tokens`, `index`, `untrusted` and
`capped_from`. It costs one tokenizer pass per section, which is why it is off by
default.

It is honoured **only when `NODE_ENV=development`** (`platform/config.ts:101`).
In production or test it is ignored and the server logs a warning at start
(`app.ts:73`). Verbose mode adds detail about the same metadata; it never adds
prompt text. Set it in `server/.env`, see `.env.example`. To see the `debug` line
on stdout also set `LOG_LEVEL=debug`; the Live Log shows it either way.
