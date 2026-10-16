# Task cards — Multi-Agent Review, iteration 1 (plan: `/Users/volodymy.rzhutenko/emdash/worktrees/dev-digest-95942142/emdash-multi-agents-rview-q9gd4/specs/2026-10-13-multi-agent-review.plan.md`, spec: `/Users/volodymy.rzhutenko/emdash/worktrees/dev-digest-95942142/emdash-multi-agents-rview-q9gd4/specs/2026-10-13-multi-agent-review.md`)
Execution mode: multi-agent — max implementer instances 3, planned 2.
- Wave 1: **IMPL-SERVER** runs T1 (both vendor contract copies + schema).
- Wave 2, in parallel: **IMPL-SERVER** continues T2 → T3 → T4 → T5 (`server/**` only); **IMPL-CLIENT** runs T6 → T7 → T10 → T8 → T9 (`client/**` only). The parent continues each instance with `SendMessage` between its tasks.
- Parent: T12 (validation + manual checklist), T11 (measurement).

**Rules for every implementer task in this workflow:**
- **Write no new test files and no new test cases** (user decision for iteration 1). Gate = typecheck of the touched package + the EXISTING suites still pass. You may only fix imports, mocks, fixtures or paths in existing tests broken by your own change; if an existing case asserts behaviour an AC replaced, adapt it in place or remove it and say so in your report.
- Non-checkpoint tasks: typecheck + existing tests near your files. Checkpoint tasks (T1, T5, T9): the package's full existing suite. Use the wave baseline the parent gives you instead of re-running it.
- Never run `pnpm build` in `client/` (the parent does the webpack check).
- Iteration 1 is deliberately simple: no drawer Stop run or error display, no `?mode=`/`?tab=`, no "also flagged by", no partial-total labels, no reaped wall-clock fallback, no seed/e2e, no Learn toast.

Read the card for your task ID, plus the plan's `## Design` where the card points to it. The plan wins over a card; the spec wins on what a requirement is.

## T1 — Contracts + schema + migration
- **Executor / Type / Depends-on / Risk:** implementer IMPL-SERVER (wave 1) / server+client contracts + DB / none / medium
- **Checkpoint:** yes (server + client full existing suites)
- **Covers:** AC-11, AC-15, AC-17, AC-18…AC-21, AC-29, AC-30, AC-33, AC-35…AC-37
- **Fixed decisions:** all additive, targeted edits mirrored in both copies (never whole-file sync).
  - `platform.ts`: `RunRequest.agent_ids` optional string array.
  - `review-api.ts`: `FindingRecord.learned_at` nullish string; `ReviewRunResponse.multi_agent_run_id` optional string; new `LearnFindingResponse { finding, memory: { id, kind: 'learning', scope: 'repo', content, created } }`.
  - `observability.ts`: `AgentColumn.status` + `queued`, `cancelled`; `ConflictTake.verdict` + `failed`, `cancelled`, `pending`; new `MultiAgentRunDetail = MultiAgentRun.extend({ status: running|done|partial|failed, total_duration_ms: nullable int, columns: AgentColumn.extend({ error: nullable, findings: FindingRecord[] })[], conflicts: Conflict.extend({ end_line, members: [{finding_id, run_id, agent_id nullable, agent_name, severity, title}], is_conflict })[] })`; new `AgentRunEstimate { agent_id, est_duration_ms nullable, est_cost_usd nullable }`.
  - `knowledge.ts`: `MemorySource` + optional `finding_id, pr_id, run_id, multi_agent_run_id, agent_id, agent_name, decision ('accepted'|'dismissed'|'undecided'), learned_at, origin ('agent_output')`.
  - `trace.ts`: `RunTrace.grounding_dropped` optional `{title, file, start_line, end_line, reason}[]`.
  - Schema: `multi_agent_runs.finished_at` timestamptz null, `duration_ms` int null; `agent_runs.multi_agent_run_id` uuid FK set null + index, `agent_runs.agent_name` text null; `findings.learned_at` timestamptz null, `findings.learned_memory_id` uuid FK → `memory.id` set null. `export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]` in `db/client.ts`.
- **Owned paths:** `{server,client}/src/vendor/shared/contracts/{platform,review-api,observability,knowledge,trace}.ts` (+ barrel `index.ts` only if needed), `server/src/db/schema/runs.ts`, `server/src/db/schema/reviews.ts`, `server/src/db/client.ts`, generated `server/src/db/migrations/0018_*.sql` + `meta/`, existing `server/test/contracts.test.ts` (fixes only)
- **Action:** edit contracts, edit schema, run `pnpm db:generate` once.
- **Traps that apply:** client `knowledge.ts`/`trace.ts` differ from server (`INSIGHTS.md:51`); shared-schema removals break vitest not tsc (`server/INSIGHTS.md:375`); never hand-edit migrations.
- **Acceptance:** one new migration + journal entry; server `pnpm typecheck` + full existing unit suite green; client `pnpm typecheck` + `pnpm test` green; `reviewer-core: npm run build`, `agent-runner: pnpm typecheck`, `mcp-server: pnpm typecheck` green; no field removed or narrowed.
- **Design pointer:** plan "Affected packages & contracts", "Design → Schema"

## T2 — Workspace scoping + `agent_ids` start
- **Executor / Type / Depends-on / Risk:** implementer IMPL-SERVER (wave 2) / server backend / T1 / medium
- **Checkpoint:** no
- **Covers:** AC-5 (server), AC-11, AC-17, AC-42, Security NFR, edge cases (dupes, foreign/unknown id, empty, > 10, disabled id accepted)
- **Fixed decisions:** `getRunInWorkspace` guards `cancelRun(workspaceId, runId)` and `getRunTrace(workspaceId, runId)` → `NotFoundError` before any bus signal or read; SSE unchanged. `normalizeAgentIds` in new pure `server/src/modules/reviews/multi-agent.ts` → 400 `invalid_run_request` (empty, > 10 distinct, mixed with `agentId`/`all`), dedupe keeps order. No transaction: validate ids, PR and every agent first (any missing → 404, nothing written), then insert parent, then children with `multi_agent_run_id` + `agent_name` (legacy runs also store `agent_name`). `agent_ids` response `{ pr_id, multi_agent_run_id, runs, reviews: [] }`; legacy response object unchanged (no key). Keep the tolerant manual body parse and the rate limit. Add the optional `multiAgentRunId` param to `executeRuns`.
- **Owned paths:** `server/src/modules/reviews/{routes,service,repository,multi-agent}.ts`, `server/src/modules/reviews/repository/run.repo.ts`, `server/src/modules/reviews/run-executor.ts` (signature only), existing `server/test/**` (fixes only)
- **Action:** repo methods, service methods, route branch; update every caller of `cancelRun`/`getRunTrace`.
- **Traps that apply:** `AppError` subclasses all report `name: 'AppError'` (`server/INSIGHTS.md:434`).
- **Acceptance:** `pnpm typecheck` green; existing `reviews-helpers.test.ts` and `routes-smoke.test.ts` green; `mcp-server: pnpm test` green. Behaviour is checked by the parent (plan M1–M4).
- **Design pointer:** plan "Design → PD1, PD2"

## T3 — Concurrent executor + `grounding_dropped` + parent end
- **Executor / Type / Depends-on / Risk:** implementer IMPL-SERVER (SendMessage) / server backend / T2 / high
- **Checkpoint:** no
- **Covers:** AC-12, AC-13 (execution), AC-14, AC-29 (server), AC-30 (write), AC-34, Observability NFR
- **Fixed decisions:** `Promise.allSettled` over all jobs after diff + intent once; `failAll` unchanged; `multi_agent_run_id` in the RunLogger context next to `correlation_id`; after all settle write parent `finished_at`/`duration_ms`; `grounding_dropped` from `outcome.dropped` (`reviewer-core/src/review/run.ts:131-132`) in the saved trace. No reviewer-core change, no parent start/terminal log lines.
- **Owned paths:** `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/repository.ts`, `server/src/modules/reviews/repository/run.repo.ts`, `server/src/platform/trace-builder.ts`, existing `server/test/**` (fixes only)
- **Action:** replace the loop at `run-executor.ts:133-159`; extend the trace at `:330-379` (and `trace-builder.ts` input if that path uses it — verify).
- **Traps that apply:** fanned-out `RunLogger` (`run-executor.ts:79-84`) — per-run `logFor` must stay separate; terminal status before trace write (`server/INSIGHTS.md:258`); boot reaper (`server/INSIGHTS.md:388`); `run_traces.log` drops structured `data` (`server/INSIGHTS.md:334`).
- **Acceptance:** `pnpm typecheck` green; existing executor-related tests green. Behaviour checked by the parent (M5–M8).
- **Design pointer:** plan "Design → Data flow, PD4"

## T4 — Parent-run read + estimates + grouping/disagreement
- **Executor / Type / Depends-on / Risk:** implementer IMPL-SERVER (SendMessage) / server backend / T3 / high
- **Checkpoint:** no
- **Covers:** AC-6, AC-9 (data), AC-10, AC-13 (status), AC-16 (read), AC-18, AC-19 (data), AC-20, AC-21, AC-30 (read), AC-33 (data), Performance NFR (zero LLM), Security NFR
- **Fixed decisions:** routes in the reviews module: `GET /multi-agent-runs/:id` → `MultiAgentRunDetail`, `GET /multi-agent/estimates` → `AgentRunEstimate[]` (enabled agents). Pure rules in `multi-agent.ts`: tokens lowercase, split on non-alphanumerics, drop < 3 chars; similar when |A∩B|/max ≥ 0.5; direct link only across different child runs, same file, overlap or start lines ≤ 2 apart, and same category or similar titles; transitive closure per file, singletons kept; title = highest severity, ties by column order; one conflict entry per group with `members` and per-agent takes (flagged with rationale note / `ignored` with `''` / `failed` / `cancelled` / `pending`); `is_conflict` over completed takes only (≥ 1 flagged + ≥ 1 ignored, or differing flagged severities); parent status: any running → running, all done → done, none done → failed, else partial; `total_duration_ms` = parent `duration_ms` or null; estimates = average of the last 5 `status='done' AND source='local'` runs, cost ignoring nulls, nulls when none. Column `agent_name` = stored ?? current; findings via `findingRowToDto`. All queries workspace-scoped; foreign parent → 404.
- **Owned paths:** `server/src/modules/reviews/{multi-agent,service,routes,repository}.ts`, `server/src/modules/reviews/repository/run.repo.ts`, existing `server/test/**` (fixes only)
- **Action:** pure rules, repository reads, two service methods, two routes.
- **Traps that apply:** aggregate over `done` only (`server/INSIGHTS.md:193`).
- **Acceptance:** `pnpm typecheck` green; existing tests green. Behaviour checked by the parent (M9–M13).
- **Design pointer:** plan "Design → File placement"

## T5 — Learn (server)
- **Executor / Type / Depends-on / Risk:** implementer IMPL-SERVER (SendMessage) / server backend / T4 / medium
- **Checkpoint:** yes (server, wave 2: full existing unit suite; `.it` suite if Docker is up)
- **Covers:** AC-35, AC-36, AC-37 (server), AC-38 (server)
- **Fixed decisions:** `POST /findings/:id/learn` → `LearnFindingResponse`; workspace check before the transaction (404, nothing written); in `db.transaction`: `UPDATE findings SET learned_at WHERE id AND learned_at IS NULL RETURNING` → row: insert `memory` (`learning`, `repo`, PR's `repo_id`, content = title, `file:start_line`, rationale, suggestion if any; `confidence` = finding's; `embedding` null; `sources: [buildLearningSource(...)]` with all AC-36 fields + `origin: 'agent_output'`), set `learned_memory_id`, `created: true`; no row: read memory via `learned_memory_id`, `created: false`. No LLM/Embedder. `findingRowToDto` adds `learned_at`. Queries in existing `repository/review.repo.ts`.
- **Owned paths:** `server/src/modules/reviews/{multi-agent,service,routes,repository,helpers}.ts`, `server/src/modules/reviews/repository/review.repo.ts`, existing `server/test/**` (fixes only)
- **Action:** pure builders, repo methods, service method, route.
- **Traps that apply:** `learned_at` may break exact DTO equality in existing tests (`reviews.it.test.ts`, `contracts.test.ts`) — fix fixtures only; transaction owned by the service (onion §4.3).
- **Acceptance:** `pnpm typecheck` + `pnpm exec vitest run --exclude '**/*.it.test.ts'` green (+ `pnpm exec vitest run .it.test` if Docker); onion §9 greps print nothing for new lines. Behaviour checked by the parent (M14–M17).
- **Design pointer:** plan "Design → PD3"

## T6 — Client data layer + pure formatting
- **Executor / Type / Depends-on / Risk:** implementer IMPL-CLIENT (wave 2, fresh spawn) / client data / T1 / low
- **Checkpoint:** no
- **Covers:** AC-5, AC-6 (display), AC-7, AC-8, AC-9, AC-10, AC-37/38 (data)
- **Fixed decisions:** hooks in existing `lib/hooks/reviews.ts`: start multi-agent review (body `{ agent_ids }`, typed `ReviewRunResponse`), `useMultiAgentRun(id)` (no polling), `useAgentEstimates()`, `useLearnFinding()` (invalidates PR reviews + multi-agent run); `useFindingAction` also invalidates the multi-agent run. New `lib/multi-agent-format.ts`: `formatSelectionTotal` ("≈ <max> · <sum known> · parallel fan-out", no-estimate agents left out), `estimateLabel` ("no estimate"), `formatRunMeta` ("N agents · parallel · <wall-clock or —> total · <sum of known costs>").
- **Owned paths:** `client/src/lib/hooks/reviews.ts`, `client/src/lib/api.ts` (only if needed), `client/src/lib/multi-agent-format.ts`, existing client tests (fixes only)
- **Action:** hooks + formatters.
- **Traps that apply:** `import type` only from `@devdigest/shared` (`client/INSIGHTS.md:137`); `useRunEvents` keys on a joined id string (`client/INSIGHTS.md:51`).
- **Acceptance:** `pnpm typecheck` green; existing `lib/hooks/reviews.test.tsx` green. Behaviour checked by the parent (M18).
- **Design pointer:** plan "Design → PD5"

## T7 — Promote drawer (+ grounding list) and FindingCard (+ Learn)
- **Executor / Type / Depends-on / Risk:** implementer IMPL-CLIENT (SendMessage) / client ui / T6 / medium
- **Checkpoint:** no
- **Covers:** AC-23 (actions), AC-25, AC-26, AC-28 (drawer), AC-29 (render), AC-35 (UI), AC-37, AC-38 (UI), AC-40
- **Fixed decisions:** new homes `client/src/components/run-trace-drawer/` and `client/src/components/finding-card/` (plain `PascalName/` sub-folders; existing tests moved with only path changes; old folders deleted, no shim). Drawer props unchanged; only addition: `trace.grounding_dropped` (title, file:line, reason) under Stats. Card: Learn next to Accept/Dismiss; pending while saving; `learned_at` → "Learned" tag (Accepted/Dismissed style) + Learn `aria-pressed` and disabled; failure → inline error text, Learn enabled; no toast; no Reply to author.
- **Owned paths:** `client/src/components/run-trace-drawer/**`, `client/src/components/finding-card/**`, old `…/pulls/[number]/_components/RunTraceDrawer/**` and `…/FindingCard/**` (deleted), `…/PrDetailView/PrDetailView.tsx`, `…/FindingsPanel/FindingsPanel.tsx`, `…/DiffTab/_components/InlineFinding/InlineFinding.tsx`, `client/messages/en/runs.json`, `client/messages/en/prReview.json`
- **Action:** move, fix imports (incl. tests' deep relative message imports), add the two small features.
- **Traps that apply:** deep message imports (`RunTraceDrawer.test.tsx:5`, `FindingCard.test.tsx:5`, `EvalCaseAction.test.tsx:6`); webpack-only failures are checked by the parent (`client/INSIGHTS.md:137`).
- **Acceptance:** `pnpm typecheck` green; moved drawer/card/EvalCaseAction tests and FindingsPanel/DiffTab tests green with path-only changes; one drawer implementation in `client/src`. Behaviour checked by the parent (M19–M22).
- **Design pointer:** none

## T10 — PR-page agent picker (runs after T7)
- **Executor / Type / Depends-on / Risk:** implementer IMPL-CLIENT (SendMessage) / client ui / T6 (serial after T7: shared `prReview.json`, `PrDetailView.tsx`) / medium
- **Checkpoint:** no
- **Covers:** AC-1, AC-2 (dropdown), AC-5 (PR page), AC-7, AC-8, AC-27 (PR page), A11y NFR
- **Fixed decisions:** enabled agents, all checked, `estimateLabel` per row, Clear, "Run multi-agent review (N)" disabled at 0, total line, "Configure agents…" → `/repos/:repoId/multi-agent`; 0 enabled → AC-27 message + `/agents` link; Run → one request with checked ids → `router.push('/repos/:repoId/multi-agent?run=<id>')`. Replaces the old one-click items.
- **Owned paths:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/**`, `…/PrDetailView/PrDetailView.tsx` (only if props change), `client/messages/en/prReview.json`
- **Action:** rework the component, selection helpers in its `helpers.ts`.
- **Traps that apply:** the existing test asserts only the trigger label (`RunReviewDropdown.test.tsx:29`).
- **Acceptance:** `pnpm typecheck` green; existing `RunReviewDropdown.test.tsx` green. Behaviour checked by the parent (M23–M24).
- **Design pointer:** none

## T8 — Multi-Agent route, nav entry, Configure run
- **Executor / Type / Depends-on / Risk:** implementer IMPL-CLIENT (SendMessage) / client ui / T6 / medium
- **Checkpoint:** no
- **Covers:** AC-2, AC-3, AC-4, AC-5, AC-7, AC-8, AC-24, AC-27 (page), A11y NFR
- **Fixed decisions:** `/repos/:repoId/multi-agent`; thin `page.tsx` → `MultiAgentView`; no `?run=` → `ConfigureRun`, with `?run=` → `MultiAgentResults` (T9; placeholder until then). Configure run: PR selector (`usePulls(repoId)`), enabled-agent cards none checked (name, description, `estimateLabel`), Select all, total line, Run disabled without PR or with 0 checks, "Pick a pull request first", AC-27 empty state + "Go to Agents" → `/agents`; start → `?run=<id>`. One-line nav entry in `client/src/vendor/ui/nav.ts` (sanctioned; say so in your report for the commit body). Namespace `client/messages/en/multiAgent.json`.
- **Owned paths:** `client/src/app/repos/[repoId]/multi-agent/page.tsx`, `…/multi-agent/_components/MultiAgentView/**`, `…/multi-agent/_components/ConfigureRun/**`, `client/src/vendor/ui/nav.ts`, existing `client/src/vendor/ui/nav.test.ts` (fixes only, if present), `client/messages/en/multiAgent.json`
- **Action:** route, view switch, Configure run, nav, strings.
- **Traps that apply:** Server Component importing `@devdigest/ui` crashes `next dev` (`client/INSIGHTS.md:68`); `useSearchParams` needs Suspense.
- **Acceptance:** `pnpm typecheck` green; existing client tests near the change green. Behaviour checked by the parent (M25–M27).
- **Design pointer:** plan "Design → PD6"

## T9 — Results page
- **Executor / Type / Depends-on / Risk:** implementer IMPL-CLIENT (SendMessage) / client ui / T7, T8 / high
- **Checkpoint:** yes (client, wave 2: full existing client suite)
- **Covers:** AC-9, AC-10, AC-13 (display), AC-15, AC-16 (UI), AC-19, AC-20, AC-21, AC-22, AC-23, AC-24 (results), AC-25, AC-28 (page), AC-33, AC-41, A11y NFR
- **Fixed decisions:** mode (default Columns), tab, conflicts toggle and open drawer are local state; only `?run=` in the URL. Live: `useRunEvents` on running children; "queued" until a child's first event, then "running"; elapsed from parent `ran_at`; on settle → refetch the parent read. Columns: name, status, elapsed / time, `LiveLogStream` tail while running, score ring with a text value when done, cost or "unknown", findings title/severity/file:line, count, View trace; failed/cancelled: status + error/"Cancelled", time, known cost, no ring; ≤ 5 share width, > 5 scroll horizontally. Tabs: summary card + `FindingCard` (`@/components/finding-card`). "Where agents disagree": one row per conflict entry (file:line + title, members' agent/title/severity, one cell per agent, "did not flag" without note, failed/cancelled/pending markers), "Show only conflicts" filters on `is_conflict`. One drawer (`@/components/run-trace-drawer`) at a time with child id, agent name, PR number, findings, `running`.
- **Owned paths:** `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/**`, `…/multi-agent/_components/MultiAgentView/**`, `client/messages/en/multiAgent.json`
- **Action:** build `RunHeader`, mode switch, `ColumnsView/AgentColumn`, `TabsView/AgentTab`, `ConflictsSection`, drawer mount; split per frontend-architecture §6.
- **Traps that apply:** keep server data in the TanStack cache ("Derive, don't store").
- **Acceptance:** `pnpm typecheck` + `pnpm test` (full existing suite) green. Behaviour checked by the parent (M28–M37).
- **Design pointer:** plan "Design → PD5, PD6"

## T11 — 1 vs 3 measurement (parent)
- **Executor / Type / Depends-on / Risk:** parent / validation / T3, T4, T10 + running app / medium (spends money)
- **Covers:** AC-31, AC-32, Performance NFR (concurrency)
- **Fixed decisions:** same PR, 1 agent then 3 (the 1 among them, same models); numbers from stored rows only; ratios to two decimals; no adjustment toward 3×; observed causes recorded.
- **Owned paths:** `specs/2026-10-13-multi-agent-review.measurements.md`
- **Action:** run both, query `multi_agent_runs`/`agent_runs`, write the table + SQL.
- **Traps that apply:** failed runs store tokens 0 (`server/INSIGHTS.md:193`) — rerun on a failed child.
- **Acceptance:** numbers match stored rows; parent wall-clock < sum of the three child durations, or the cause is stated.
- **Design pointer:** none

## T12 — Validation + manual checklist (parent)
- **Executor / Type / Depends-on / Risk:** parent / validation / T1–T10 / medium
- **Covers:** every AC whose `Verify:` names a test (see plan Coverage), AC-40 PR-page `?trace=`
- **Fixed decisions:** run the plan's Testing strategy commands; client webpack check with nothing on port 3000; run the plan's manual checklist M1–M37 and record each line PASS/FAIL with evidence in the Delivery log; `engineering-insights`; then the plan's "Review and fix loop" (architecture-reviewer + plan-verifier once, `fix-cap: 1`, ≤ 2 fix dispatches), Delivery log, hand-off to `/pr-self-review`.
- **Owned paths:** package `INSIGHTS.md` files, the plan's `## Delivery log`
- **Action:** as above.
- **Traps that apply:** never `pnpm build` while `next dev` runs (`client/INSIGHTS.md:147`).
- **Acceptance:** all commands green; every manual line recorded.
- **Design pointer:** plan "T12 manual checklist", "Review and fix loop"
