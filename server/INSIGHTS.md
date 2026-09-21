# server — insights

Findings that cost real debugging time. Append new entries; don't rewrite old ones.
Cross-package findings belong in the root `INSIGHTS.md`.

## What Works

_No entries yet._

## What Doesn't Work

### `` `file://${process.argv[1]}` `` as a CLI entrypoint guard — silently never fires on a path with a space

`server/src/db/migrate.ts:39` · `server/src/db/seed.ts:229` · 2026-09-16

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

### A detailed reviewer prompt makes the with/without-skills experiment vacuous

`server/src/db/seed-prompts.ts` (`API_CONTRACT_REVIEWER_PROMPT`) · `docs/agent-prompts/api-contract-reviewer.md` · 2026-09-21

With every skill unticked, API Contract Reviewer still flagged the `cost_usd → costUsd` rename, the removed
`tokens_out` and the moved route on PR #1 in 3 of 4 runs (2, 0, 4 and 4 blockers), so the baseline was not silent and
the control experiment (criteria 17/18) could show no difference. The cause was the prompt itself: its "What to look
for" list was the breaking-change checklist, with `cost_usd` → `costUsd` as a literal example, and the severity levels
defined CRITICAL as exactly those changes. Test Quality Reviewer had the same shape (uncovered branches, boundaries).

Skills only add signal when the prompt leaves room for them. Both prompts are now role-level: who you are, scope,
severity and verdict conventions, and "apply the rules in Skills / rules". The DB row is what runs, and the seed only
inserts missing agents, so an existing workspace needs `PUT /agents/:id` (or the Config tab) to pick the change up.
Do not judge a skill by a run on an agent whose prompt already contains the same checklist. Also expect run-to-run
variance: the same diff gave 0 findings once and 4 blockers three times, so a single baseline run proves nothing.

### Reviewing a freshly synced PR before opening it runs on an EMPTY diff and approves it

`server/src/modules/reviews/diff-loader.ts:9` · `server/src/modules/pulls/routes.ts:27` · 2026-09-21

Three runs started through `POST /pulls/:id/review` right after the PR list synced came back `approved`, 0 findings,
`grounding 0/0 passed` — on a PR whose other runs found 3 issues. The tell was in the run row: `tokens_in` 994 against
2118 for the same agent on the same PR, and `run_traces.trace->'prompt_assembly'->>'user'` was 560 characters instead of
5751, i.e. the prompt held no diff. A calibration built on those runs ("baseline finds nothing") was wrong and was reported
as valid before the token counts were checked.

`loadDiff` tries a local `git diff base...head` and, when that throws (the shallow clone does not have the PR head yet),
falls back to the `pr_files` patches. `GET /repos/:id/pulls` stores PR metadata only; `pr_files` is filled when the PR
detail is opened (`GET /pulls/:id`). With neither source there is nothing to review and the model dutifully returns an
empty findings list, which the UI shows as a clean approval. Prime it first (open the PR page, or `GET /pulls/:id`), and
sanity-check a run: `tokens_in` and the `prompt_assembly.user` length must reflect the diff. A run with 0 findings and
`0/0 passed` grounding is not evidence of a clean PR.

## Codebase Patterns

### New fields on a jsonb-persisted contract must be `.nullish()`, not `.nullable()`

`server/src/vendor/shared/contracts/trace.ts:69` · `server/src/db/schema/runs.ts:31` · 2026-09-16

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

`server/src/modules/reviews/run-executor.ts:303` · `server/src/modules/pulls/routes.ts:142-158` · 2026-09-17

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


### A fine-grained GitHub PAT only sees the repositories chosen when it was created

`server/.env` (`GITHUB_TOKEN`) · `server/src/modules/repos/service.ts:55` · 2026-09-21

A token starting `github_pat_` is fine-grained. A repository created after the token was issued is invisible to it,
even the owner's own: `GET /repos/<owner>/<repo>/pulls` returns **404** (not 403) and `git clone` returns
`403 Write access to repository not granted`. Neither message says "token scope". `gh` used a different OAuth
token, which is why the same repo worked from the CLI. Fix: add the repo under the token's *Repository access*
(needs Contents: read, Pull requests: read), or make the repo public. Also note the clone URL embeds the token
(`https://x-access-token:<token>@github.com/…`), so a git error printed to the log contains it in clear text.

## Recurring Errors & Fixes


### A failed clone job crashes the whole API process

`server/src/platform/jobs.ts:85` · `server/src/modules/repos/service.ts:98` · 2026-09-21

Adding a repo the GitHub token cannot read (`POST /repos` for a private repo outside a fine-grained PAT's
list) killed the API: the log ends with `GitError: … Write access to repository not granted … 403` and
`Node.js v24.11.0`, after which the web app shows "network error" until `./scripts/dev.sh` is restarted.

`JobRunner.enqueue` marks the row `failed`, then re-throws (`throw err`) inside the queued task, and returns that
task as `done`. `RepoService.add` and `refresh` `await enqueue(...)` for the *insert* but discard `done`, so the
rejection has no handler. Node 15+ turns an unhandled rejection into a process exit. The same pattern applies to
every other caller of `enqueue`. Until callers attach a handler (or the runner swallows after recording the
failure), a bad token, a deleted repo or a network blip on any job kind takes the server down. Repro:
`POST /repos {url: "https://github.com/<owner>/<private-repo-outside-the-token>"}`.

## Session Notes

### 2026-09-16 — Run cost badge

`server/src/db/migrations/0010_skinny_punisher.sql:1` · `server/src/modules/reviews/run-executor.ts:269` · 2026-09-16

Restored `agent_runs.cost_usd` (migration `0010`) and stopped `run-executor.ts` discarding the
`costUsd` every LLM adapter already computes; added the PR-list `SUM`, the `reviews`→`agent_runs`
join, the `backfill-cost` script, and the four client surfaces. Two findings recorded above: the
entrypoint-guard no-op and the jsonb `.nullish()` rule.

### 2026-09-21 — L02 skills wiring

`server/package.json` · `server/pnpm-lock.yaml` · 2026-09-21

`pnpm add` with pnpm 10 refuses to run because `server/node_modules` was linked by a pnpm 11 store; the
agent had to use `npx pnpm@11 add @fastify/multipart fflate`, which rewrote ~120 lockfile lines. Use the
same pnpm major that created `node_modules` before any dependency change.

`server/src/modules/reviews/run-executor.ts` · `server/src/platform/trace-builder.ts` · 2026-09-21

Skills reached no prompt before L02 because two call sites hardcoded `skills: null`; wiring only the
prompt would have left the trace claiming no skill was used. `run_skills` is written before the run's
`try`, so failed runs are attributed too.

## Open Questions

_No entries yet._
