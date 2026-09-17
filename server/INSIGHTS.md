# server — insights

Findings that cost real debugging time. Append new entries; don't rewrite old ones.
Cross-package findings belong in the root `INSIGHTS.md`.

## What Works

_No entries yet._

## What Doesn't Work

### `` `file://${process.argv[1]}` `` as a CLI entrypoint guard — silently never fires on a path with a space

`server/src/db/migrate.ts:39` · `server/src/db/seed.ts:227` · 2026-09-16

Both scripts gated their CLI entrypoint with `` if (import.meta.url === `file://${process.argv[1]}`) ``.
`import.meta.url` percent-encodes a space as `%20`; `process.argv[1]` keeps the literal space. On a
checkout like `~/Documents/AI Course/dev-digest` the two never match, so `pnpm db:migrate` prints
nothing, exits `0`, and applies no migrations. There is no error — the only symptom is downstream,
as a column or table that the schema says exists but the database has never heard of.

Verified directly: a probe under `server/src/db/` printed
`meta: file:///Users/.../AI%20Course/...` vs `argv1: /Users/.../AI Course/...`, `match: false`.

Fix is `pathToFileURL(process.argv[1]).href`, which encodes both sides the same way:

```ts
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
```

Applied to `migrate.ts` and the new `backfill-cost.ts`. **`seed.ts:227` is still on the broken
comparison** — `pnpm db:seed` is a no-op on any checkout whose path contains a space.

The test suite cannot catch this: `test/helpers/pg.ts` calls `runMigrations()` as a function, so
Testcontainers integration tests go green against a correctly-migrated database while the developer's
own database is silently several migrations behind. After adding a migration, confirm the column
actually landed rather than trusting a clean `pnpm db:migrate`.

**Update 2026-09-17:** `seed.ts` now uses the same `pathToFileURL` guard. It showed up as a real failure: `./scripts/e2e.sh` ran `pnpm db:seed` against the isolated Postgres. That step printed only the pnpm banner, with no "✓ seeded", and exited 0. The API then answered every request with `No system user found — run \`pnpm db:seed\`.`, and all 7 e2e flows failed. The tell is a missing "✓ seeded" line. After the fix, 7/7 flows pass.

## Codebase Patterns

### New fields on a jsonb-persisted contract must be `.nullish()`, not `.nullable()`

`server/src/vendor/shared/contracts/trace.ts` · `server/src/db/schema/runs.ts` · 2026-09-16

`RunStats` is not just a wire DTO — the whole `RunTrace` is stored as a single jsonb document in
`run_traces.trace` and re-parsed through the same Zod schema when the trace drawer opens. Documents
written before a field existed have no such key at all, so `z.number().nullable()` on a new field
rejects every historical trace: adding cost tracking would have broken the drawer for every run
already in the database.

`.nullish()` accepts both the missing key and an explicit null. This applies to any field added to
`RunStats`, `PromptAssembly`, `ToolCall` or `RunLogLine` — anything reachable from `RunTrace`. Wire-
only contracts such as `RunSummary` (built fresh from columns on every request) have no such
constraint and use `.nullable()`.

Guarded by the `RunTrace (data2.jsx TRACE single-document)` case in `server/test/contracts.test.ts`,
which parses a trace with no `cost_usd` key and asserts it still succeeds.

### Failed `agent_runs` store tokens `0`, not `NULL` — aggregate over `status = 'done'` only

`server/src/modules/reviews/run-executor.ts:303` · `server/src/modules/pulls/routes.ts:147-153` · 2026-09-17

On the failure/cancel path `completeAgentRun` writes `tokens_in = 0` and `tokens_out = 0` (only
`cost_usd` is written as `NULL`). A zero there does not mean "used no tokens" — the run may have
spent tokens before throwing; the usage is simply unknown. Anything that treats those zeros as real
data turns unknown into free: the first version of `backfill-cost.ts` filtered on
`isNotNull(tokensIn)`, so it would have priced every failed run at `$0`, and the PR-list `SUM` would
then show `$0.0000` for a PR whose runs all failed instead of `—`.

Any aggregate over `agent_runs` usage — cost, tokens, averages — must add
`eq(t.agentRuns.status, 'done')`, not rely on NULLs. Guarded by the "counts only successful runs"
case in `test/reviews.it.test.ts` and the failed-run assertion in `test/backfill-cost.it.test.ts`.

## Tool & Library Notes

_No entries yet._

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

### 2026-09-16 — Run cost badge

Restored `agent_runs.cost_usd` (migration `0010`) and stopped `run-executor.ts` discarding the
`costUsd` every LLM adapter already computes; added the PR-list `SUM`, the `reviews`→`agent_runs`
join, the `backfill-cost` script, and the four client surfaces. Two findings recorded above: the
entrypoint-guard no-op and the jsonb `.nullish()` rule.

## Open Questions

_No entries yet._
