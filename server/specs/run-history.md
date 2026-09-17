# Run history & run control endpoints

Status: implemented · Handlers: `src/modules/reviews/routes.ts` ·
Repository: `src/modules/reviews/repository/run.repo.ts` · Contract: `RunSummary`
(`src/vendor/shared/contracts/trace.ts`). Lifecycle background:
`../docs/review-run-lifecycle.md`.

## `GET /pulls/:id/runs` — every run of a PR

- Returns **all** `agent_runs` rows for the PR in the caller's workspace, any
  status, newest `ran_at` first, with `agent_name` joined from `agents`
  (null if the agent was deleted).
- Settled-run fields (`duration_ms`, `tokens_*`, `cost_usd`, `findings_count`,
  `grounding`, `score`, `blockers`) are meaningful only for `status='done'`;
  failed/cancelled rows carry `error` and zeroed/null usage.
- `findings: FindingPreview[] | null` — the previews of the review whose
  `run_id` is this run. `null` = the run produced no review (running, failed,
  cancelled); `[]` = review with no findings. Two batched queries regardless of
  how many runs (reviews by `run_id IN …`, then previews).

## `GET /pulls/:id/runs/active`

Only `status='running'` rows (`run_id`, `agent_id`, `agent_name`, `ran_at`). The
client polls it every 4 s while non-empty — this, not client memory, is the
source of truth for "a review is in progress".

## `POST /runs/:id/cancel`

Always answers `{ ok: true }`. Marks the run cancelled **only if it is still
running** (a finished run is left untouched), signals the in-memory bus so the
engine stops at its next checkpoint, and completes the SSE stream.

## `DELETE /runs/:id`

Deletes the run, its trace (FK cascade) **and** the review with that `run_id`
(explicit — there is no FK), which cascades to its findings. Answers
`{ ok: boolean }` — `false` when no run with that id exists in the workspace
(not a 404).

## `GET /runs/:id/events` (SSE)

Replays the run's buffered events first, then streams live ones; the stream
ends when the run completes. No rate limit (one long-lived connection).

## Tests

`test/reviews.it.test.ts` — full run (grounding keeps 1 of 2, cost reaches the
trace, the run row and `/runs`, previews on `/runs`); run history previews
(done ⇒ own review, clean ⇒ `[]`, failed ⇒ `null`); SSE stream completes.
