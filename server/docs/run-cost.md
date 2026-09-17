# Run cost — where the number comes from

L01 feature. UI behaviour: `../../client/specs/run-cost-display.md`.

## Source of truth

1. Every LLM provider returns a USD cost with its usage:
   - OpenRouter (`../reviewer-core/src/llm/openrouter.ts`) — the **real billed**
     `usage.cost` from the API, falling back to an injected estimator;
   - OpenAI / Anthropic (`src/adapters/llm/{openai,anthropic}.ts`) —
     `estimateCost(model, tokensIn, tokensOut)` from the static list-price table
     `src/adapters/llm/pricing.ts`; `null` for a model not in the table.
2. `reviewer-core`'s `reviewPullRequest` returns it as `outcome.costUsd`.
3. `ReviewRunExecutor.runOneAgent` persists it twice
   (`src/modules/reviews/run-executor.ts:243-270`):
   - `agent_runs.cost_usd` (column added in migration `0010_skinny_punisher.sql`)
   - `run_traces.trace.stats.cost_usd` (jsonb, feeds the trace drawer's COST tile)

`cost_usd` is **nullable on purpose**: `null` = unknown (unpriced model, or the
run died before usage arrived), `0` = genuinely free. The UI renders unknown as
`—`, never `$0.00`.

## Where it is read

| Surface | Endpoint / query | Rule |
|---|---|---|
| PR list COST column | `GET /repos/:id/pulls` → `sum(agent_runs.cost_usd)` grouped by PR (`src/modules/pulls/routes.ts:142-158`) | only `status = 'done'` runs; no done run ⇒ `null` |
| Timeline tile | `GET /pulls/:id/runs` → `RunSummary.cost_usd` | per run; the client shows it only for settled runs |
| Review run header | `GET /pulls/:id/reviews` → joined from `agent_runs` via `reviews.run_id` | absent for reviews without a run (seed data) |
| Trace drawer → Stats | `GET /runs/:id/trace` → `stats.cost_usd` | `nullish`: traces written before cost tracking have no key |

## Why only successful runs are summed

Failed and cancelled runs write tokens `0` and `cost_usd` `null`
(`run-executor.ts:300-310`) because the usage never arrived. Summing them would
either add nothing or — for rows backfilled from older data — add made-up
numbers, and a PR whose runs all failed would read `$0`. Filtering on
`status = 'done'` keeps "unknown" distinct from "free".

## Backfill

`pnpm db:backfill-cost` (`src/db/backfill-cost.ts`) prices historical runs that
finished before cost was tracked: rows with `status='done'`, `cost_usd IS NULL`
and stored tokens, using the **static** `estimateCost` (no network ⇒
deterministic, re-runnable). These are *estimates* (tokens × list price), unlike
the billed cost new OpenRouter runs record; unpriced models stay `NULL`. It is a
script, not a migration, because SQL migrations can't reach the pricing table.
Covered by `test/backfill-cost.it.test.ts`.
