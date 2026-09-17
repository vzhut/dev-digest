# Review run lifecycle

How one click on **Run review** becomes persisted findings, a live log and a
run trace — and what each state looks like in the database.

Code: `src/modules/reviews/{routes,service,run-executor}.ts`,
`src/modules/reviews/repository/run.repo.ts`, engine in `../../reviewer-core`.

## Sequence

```mermaid
sequenceDiagram
  participant UI as client
  participant R as routes.ts
  participant S as ReviewService
  participant X as ReviewRunExecutor
  participant E as reviewer-core
  participant DB as Postgres
  participant B as runBus (in-memory)

  UI->>R: POST /pulls/:id/review {agentId | all:true}
  R->>S: resolveTargets → runReview
  S->>DB: INSERT agent_runs (status='running') per agent
  S-->>UI: { runs:[{run_id,…}], reviews:[] }  (returns immediately)
  S--)X: executeRuns(...)  fire-and-forget
  UI->>R: GET /runs/:id/events (SSE, replay buffer first)
  X->>B: Loading PR diff… (fanned out to every run)
  loop each agent, sequentially
    X->>E: reviewPullRequest(systemPrompt, diff, llm, repoMap, …)
    E-->>X: review (grounded) + tokens + costUsd + raw + assembly
    X->>DB: INSERT reviews (run_id) + findings
    X->>DB: UPDATE agent_runs → done (tokens, cost_usd, findings_count, score, blockers)
    X->>DB: INSERT run_traces (ONE jsonb document)
    X->>B: complete(runId) → SSE stream ends
  end
  UI->>R: refetch /pulls/:id/runs and /pulls/:id/reviews
```

## Why it is shaped like this

- **Rows first, work later.** `ReviewService.runReview` (`service.ts:103`) creates
  every `agent_runs` row before any LLM call so the HTTP response already carries
  `run_id`s. The client subscribes to SSE and survives reloads because
  "what is running" is read from the DB (`GET /pulls/:id/runs/active`), not from
  client state.
- **Diff loaded once, agents run one after another.** `executeRuns`
  (`run-executor.ts:55`) loads the diff once for all jobs, then loops the agents.
  A failing agent is caught and persisted as `failed`; the loop continues.
- **The engine is pure.** `reviewPullRequest` does prompt → LLM → grounding →
  score. The executor owns only I/O: repo-intel context (callers digest, repo
  map, rank note — skipped when the agent's `repoIntel` toggle is off),
  persistence and observability.
- **One trace document per run.** `run_traces.trace` is a single jsonb blob
  (config, stats, prompt assembly, tool calls, raw model output, full log). New
  fields on it must be `.nullish()` — old documents lack them
  (see `../INSIGHTS.md`).

## States of `agent_runs.status`

| Status | Set by | Row contents |
|---|---|---|
| `running` | `createAgentRun` | provider, model, `ran_at` |
| `done` | `runOneAgent` success | duration, tokens, `cost_usd`, `findings_count`, `grounding` ("k/n passed"), `score`, `blockers` |
| `failed` | agent error, diff-load failure (`failAll`), or boot reaper | `error`, tokens `0`, `cost_usd` null, `findings_count` 0; a minimal trace built from the event buffer |
| `cancelled` | `POST /runs/:id/cancel` → `cancelRunIfRunning` (only if still running) | the engine throws `RunCancelledError` at its next checkpoint (before each chunk LLM call) |

- **Reaper:** on boot `app.ts:81` calls `reapStaleRuns()`, which flips every
  row still `running` to `failed` — those belonged to a process that died.
- **Blockers vs verdict:** `blockers = countBlockers(findings, agent.ciFailOn)`
  is deterministic (severity ≥ the agent's gate). The timeline colours runs on
  blockers, never on the model's `verdict`.

## Run ↔ review link

`reviews.run_id` points at `agent_runs.id` **without a foreign key**. Consequences:

- deleting a run must delete its review explicitly (`deleteAgentRun`,
  `run.repo.ts`), otherwise findings are orphaned in the Review runs list;
- joins go through `run_id` on read: review cost/tokens
  (`reviewsForPull`), timeline finding previews (`listRunsForPull`);
- seeded reviews have no `run_id` — they appear under Review runs but never on
  the Timeline.
