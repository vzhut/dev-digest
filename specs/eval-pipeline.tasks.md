# Task cards — Eval Pipeline (plan: `/Users/volodymy.rzhutenko/Documents/AI Course/dev-digest/specs/eval-pipeline.plan.md`, spec: `/Users/volodymy.rzhutenko/Documents/AI Course/dev-digest/specs/eval-pipeline.md`)
Execution mode: single-agent — one implementer runs T1 → T17 in order (T17: write the flow only); T18–T20 and the e2e/webpack runs are the parent's.
Read the card for your task ID, plus the plan's `## Design` section when the card points to it. The plan wins over a card on any mismatch; the spec wins on what a requirement is.
Per-task test rule: run only the card's targeted tests + the package typecheck. The full package suite runs only at the Checkpoint tasks (server T10, client T16), as requested by the parent.

Decisions all cards rely on (plan `## Open decisions`, defaults — confirm with the user before starting if not yet confirmed):
- D1 extend `eval_runs` in place into the suite-level run; per-case results in jsonb `results`; `case_id` nullable.
- D2 errored cases excluded from every metric numerator/denominator (`pass:null`); zero denominator → `null`.
- D3 finding lines outside the frozen hunks (incl. after the 400-line cap) → `422 expectation_not_grounded` (no patch → `422 diff_unavailable`).
- D4 agent version lives on the run (`eval_runs.agent_version`); NO `source_agent_version` on the case.
- D5 provider/key failure → every case `error`, run `completed` with `cases_errored` = n; run status `errored` only for run-level exceptions.
- D6 sidebar label via `nav.ts` + `messages/en/shell.json` nav key; page texts in `eval.json`.
- Precision = (kept − FP)/kept summed over non-errored cases, FP = kept findings matching a `must_not_flag` (≡ `1 − FP/total`); unlabeled reported separately. Recall = matched `must_find` / scored `must_find`. Citation = kept / (kept + dropped).
- Runs execute in-process (`void executor.runSuite(...).catch(...)`), not via `JobRunner` (120 s timeout, 2 retries — `server/src/platform/jobs.ts:41-42`).
- Keep existing contract names (`traces_passed`, `traces_total`); add new schemas, rename nothing.

## T1 — Shared eval contracts (both copies) + contract tests
- **Executor / Type / Depends-on / Risk:** implementer / backend (vendor/shared, server + client) / none / medium
- **Covers:** AC-1, AC-2, AC-3, AC-6, AC-10, AC-11, AC-16, AC-28, AC-30, AC-31, AC-35, AC-36, AC-39, AC-41
- **Fixed decisions:** schema list and field names in the plan T1 Action; jsonb-backed fields `.nullish()`; the eval region of `eval-ci.ts` is byte-identical in both copies; nothing outside the eval region is synced.
- **Owned paths:** `server/src/vendor/shared/contracts/eval-ci.ts`, `client/src/vendor/shared/contracts/eval-ci.ts`, `server/test/contracts.test.ts`, `server/test/eval-contract-parity.test.ts`
- **Action:** add the new eval schemas + inferred types to the eval region (server first, identical text into the client copy); extend `test/contracts.test.ts`; create `test/eval-contract-parity.test.ts` comparing the eval region of `eval-ci.ts` (section header `// Eval —` … up to `// Compose Review`) and the `// ---- Eval ----` block of `knowledge.ts` across both copies as text.
- **Traps that apply:** copies already drift elsewhere (root `INSIGHTS.md:51`); `.nullish()` for jsonb fields (`server/INSIGHTS.md:149`); renaming a schema breaks vitest, not tsc (`server/INSIGHTS.md:363`). Commit body must call out the deliberate shared-contract change.
- **Acceptance:** `cd server && pnpm exec vitest run test/contracts.test.ts test/eval-contract-parity.test.ts` green; server and client `pnpm typecheck` green; a one-char edit in the client eval region turns parity red (revert).
- **Design pointer:** plan `## Design` → Endpoints table (response shapes).

## T2 — Schema extension + generated migration
- **Executor / Type / Depends-on / Risk:** implementer / backend / T1 / high
- **Covers:** AC-3, AC-6, AC-13, AC-16, AC-18, edge "agent deleted" (OQ-14)
- **Fixed decisions:** D1; add-only (no drop/rename); `agent_id → agents.id on delete cascade` on both tables; unique `(source_finding_id, owner_kind, owner_id)`; partial unique `(agent_id) WHERE status='running'`; CHECK `owner_kind <> 'agent' OR agent_id = owner_id`.
- **Owned paths:** `server/src/db/schema/eval.ts`, `server/src/db/rows.ts`, `server/src/db/migrations/**` (generated only)
- **Action:** confirm `eval_cases`/`eval_runs` are empty in the dev DB (stop and report if not); extend the schema per plan Design/Schema; `$type<>()` jsonb columns with T1 types; add row types; `pnpm db:generate` in a real TTY; `pnpm db:migrate`.
- **Traps that apply:** `db:generate` rename prompt hangs without a TTY (`server/INSIGHTS.md:267`); never hand-edit migrations; check for a circular import between `schema/eval.ts` and `schema/agents.ts`.
- **Acceptance:** exactly one new `0016_*.sql`; migrate applies cleanly; `pnpm typecheck` green; SQL contains both cascading FKs and the partial index.
- **Design pointer:** plan `## Design` → Schema.

## T3 — Scoring (pure)
- **Executor / Type / Depends-on / Risk:** implementer / backend (domain) / T1 / medium
- **Covers:** AC-21–AC-27, AC-29, NFR scoring perf
- **Fixed decisions:** D2; precision/recall/citation formulas above; only kept (grounded) findings are scored; path normalisation strips `a/`, `b/`, `./`; closed ranges with reversed ranges normalised.
- **Owned paths:** `server/src/modules/eval/scoring.ts`, `server/src/modules/eval/scoring.test.ts`, `server/src/modules/eval/constants.ts`
- **Action:** `normalizePath`, `matches`, `scoreCase`, `errorCaseOutcome`, `scoreRun` (metrics, `traces_passed/total`, `cases_errored`, `unlabeled`, `cost_usd` sum of known + `cost_partial`); constants `REGRESSION_DELTA = 0.05`, `FROZEN_DIFF_MAX_CHANGED_LINES = 400`. Imports: `@devdigest/shared` types only.
- **Traps that apply:** none.
- **Acceptance:** `pnpm exec vitest run src/modules/eval/scoring.test.ts` green with the cases listed in plan T3 (overlap/adjacent/single-line/different file/reversed; hand-computed recall; noise + unlabeled precision; dropped → citation; `must_not_flag`-only silent → all `null`, all pass; each pass branch; twice-run determinism with a throwing LLM fake; partial cost; 50×20 under 50 ms).

## T4 — Frozen input (pure)
- **Executor / Type / Depends-on / Risk:** implementer / backend (domain) / T1, T3 / medium
- **Covers:** AC-3, AC-5, AC-9
- **Fixed decisions:** OQ-3 cap 400 changed lines → intersecting hunks ± 1 neighbour; D3; synthetic header exactly as `server/src/modules/reviews/diff-loader.ts:37-41`; name `<type>-<slug>` (lowercase ascii, ≤ 60 chars).
- **Owned paths:** `server/src/modules/eval/frozen-input.ts`, `server/src/modules/eval/frozen-input.test.ts`
- **Action:** `synthesizeFrozenDiff`, `isExpectationGrounded` (reuse `groundFindings` from `@devdigest/reviewer-core`), `expectationFromFinding`, `caseName`, `caseMetaFrom`; typed `diff_unavailable` result for null/empty/binary patch.
- **Traps that apply:** file paths are attacker-controlled; `wrapUntrusted` doesn't escape `</untrusted>` in labels (`server/INSIGHTS.md:369`). Do not import `adapters/*` from `frozen-input.ts` (tests may import `parseUnifiedDiff`).
- **Acceptance:** `pnpm exec vitest run src/modules/eval/frozen-input.test.ts` green (headers verbatim; cap; null patch; outside-hunk not grounded; name sample `must_find-hardcoded-stripe-secret-key`).

## T5 — Prompt diff, compare, regression callout (pure)
- **Executor / Type / Depends-on / Risk:** implementer / backend (domain) / T1, T3 / low
- **Covers:** AC-31, AC-33, AC-37, AC-40
- **Fixed decisions:** old/new decided by `ran_at`, not selection order; regression = drop ≥ 0.05 on any non-null metric; LCS line diff, no new dependency; `same_config` flag when snapshots match.
- **Owned paths:** `server/src/modules/eval/prompt-diff.ts`, `server/src/modules/eval/prompt-diff.test.ts`, `server/src/modules/eval/callout.ts`, `server/src/modules/eval/callout.test.ts`
- **Action:** `lineDiff`, `compareRuns` (metric deltas, cost/passed, flipped cases, config diff provider/model/skills id@version, case-set common/added/removed), `regressions(latest, previous)`.
- **Traps that apply:** none.
- **Acceptance:** `pnpm exec vitest run src/modules/eval/prompt-diff.test.ts src/modules/eval/callout.test.ts` green (newer-then-older → earlier is old; +/- lines; case-set counts; 0.06 flagged, 0.04 not).

## T6 — Executor + ports; move skills helpers to `_shared`
- **Executor / Type / Depends-on / Risk:** implementer / backend (application) / T3, T4 / high
- **Covers:** AC-4, AC-15, AC-20, AC-27, NFR cost / security / observability
- **Fixed decisions:** D5; prompt = frozen diff + PR body (`prDescription`) + task line `Review PR #<n>: <title>` + agent system prompt/model/strategy + enabled linked skills; **no** intent, specs, callers, repoMap, memory; `parseUnifiedDiff` injected via `ports.ts`; executor imports no `adapters/*` and no other module.
- **Owned paths:** `server/src/modules/_shared/run-skills.ts`, `server/src/modules/reviews/helpers.ts`, `server/src/modules/eval/ports.ts`, `server/src/modules/eval/executor.ts`, `server/src/modules/eval/executor.test.ts`
- **Action:** move `resolveRunSkills`, `toPromptSkills`, `AgentSkillLinkRow`, `ResolvedSkill` to `_shared/run-skills.ts` and re-export them from `reviews/helpers.ts`; define `EvalExecutorDeps`; implement `runSuite` (resolve provider once; per-case try/catch → `errorCaseOutcome`; `scoreCase`; `store.markProgress` per case; `scoreRun` + status at the end); structured logs start/per-case/finish under one correlation id, never diff/PR/prompt text.
- **Traps that apply:** fail-fast stub for every provider (`server/INSIGHTS.md:229`); `PinoLike.info(obj, msg)` mock shape (`server/INSIGHTS.md:414`); ripple of the move — `reviews/run-executor.ts`, `reviews/repository/run.repo.ts`, `test/skills-run-wiring.test.ts` must stay green via the re-export.
- **Acceptance:** `pnpm exec vitest run src/modules/eval/executor.test.ts test/skills-run-wiring.test.ts test/reviews-helpers.test.ts` green with the assertions in plan T6 (absent sections; case 2 of 3 fails → `completed`; LLM calls = cases; no git/GitHub dep; correlation id in logs; planted `sk_live_TEST123` never logged); `pnpm typecheck` green.

## T7 — Repository, service, routes: cases
- **Executor / Type / Depends-on / Risk:** implementer / backend / T2, T4, T6 / high
- **Covers:** AC-1–AC-3, AC-5–AC-13, NFR workspace 404, edge "agent deleted"
- **Fixed decisions:** D3, D4; endpoints `POST /findings/:id/eval-case`, `GET /pulls/:id/eval-case-links`, `GET /agents/:id/eval-cases`, `GET /eval-cases/:id`, `DELETE /eval-cases/:id` with the codes in the plan Design table; dedup via `on conflict do nothing` + re-select → `200 {created:false}`; narrow-deps service (template `server/src/modules/brief/routes.ts:15-31`); errors as `AppError` subclasses.
- **Owned paths:** `server/src/modules/eval/repository.ts`, `server/src/modules/eval/service.ts`, `server/src/modules/eval/routes.ts`, `server/src/modules/index.ts`, `server/test/eval.it.test.ts`
- **Action:** repository queries (all take `workspaceId`; finding ⨝ review ⨝ PR ⨝ repo + the file's `pr_files.patch` + D4 version), service use cases, thin routes with Zod schemas, register `eval` in `modules/index.ts`; `test/eval.it.test.ts` cases for AC-1, AC-2, AC-3 (+ mutate source, case unchanged), AC-6, AC-7, AC-8, AC-9, AC-13, foreign workspace 404, agent delete cascades.
- **Traps that apply:** `AppError` subclasses report `name: 'AppError'` (`server/INSIGHTS.md:407`) — assert on code/status; validation only via route `schema`; no `modules/reviews/*` / `modules/agents/*` imports.
- **Acceptance:** `pnpm exec vitest run test/eval.it.test.ts` green (Docker); onion-architecture §9 greps print nothing for `src/modules/eval`; `pnpm typecheck` green.
- **Design pointer:** plan `## Design` → Server placement, Endpoints.

## T8 — Runs, compare, dashboards, run-all
- **Executor / Type / Depends-on / Risk:** implementer / backend / T5, T6, T7 / high
- **Covers:** AC-14, AC-16–AC-19, AC-30, AC-31, AC-35–AC-37, AC-39 (optional), AC-40, NFR POST < 1 s, edge "stuck run"
- **Fixed decisions:** in-process background run with `.catch` → persist `errored`; 409 from the partial unique index; startup sweep marks orphaned `running` runs `errored` (`error_reason 'server_restarted'`); `422 compare_different_agents`; rate limit on `POST /agents/:id/eval-runs` and `POST /eval/run-all` (like `server/src/modules/brief/routes.ts:42-46`).
- **Owned paths:** `server/src/modules/eval/repository.ts`, `server/src/modules/eval/service.ts`, `server/src/modules/eval/service.test.ts`, `server/src/modules/eval/routes.ts`, `server/test/eval.it.test.ts`
- **Action:** repository run methods (insert running, progress, finish, list, get, recent, agents with cases, agent snapshot with enabled skills name/version, fail orphaned); service `startRun` (202 without awaiting), `listRuns`, `getRun`, `compare`, `workspaceDashboard`, `agentDashboard` (+ `regressions`), optional `runAll`; routes per Design table; extend `test/eval.it.test.ts` with the plan T8 cases (202 before fake LLM resolves; AC-16 fields; 409; 422 no cases; git/github throwing overrides → completes; compare across agents 422; run-all started/skipped; foreign workspace 404).
- **Traps that apply:** unhandled background rejection crashes the API (`server/INSIGHTS.md:378`); stub every provider (`server/INSIGHTS.md:229`); poll the run row until terminal, never sleep (`server/INSIGHTS.md:246`).
- **Acceptance:** `pnpm exec vitest run test/eval.it.test.ts src/modules/eval/service.test.ts` green; `pnpm typecheck` green.
- **Design pointer:** plan `## Design` → Endpoints.

## T9 — Seed decided, agent-attributed findings
- **Executor / Type / Depends-on / Risk:** implementer / backend / T7 / medium
- **Covers:** AC-1, AC-2 (demo/e2e data), homework ≥ 8 cases / ≥ 3 `must_not_flag` (OQ-8)
- **Fixed decisions:** one extra review by the General agent on PR #482, `run_id` null, `created_at` older than the existing seeded review; ≥ 6 accepted, ≥ 4 dismissed, 1 undecided; lines inside the seeded new-file patches (`server/src/db/seed.ts:160`); idempotent re-seed; existing 2-finding review unchanged and newest.
- **Owned paths:** `server/src/db/seed.ts`
- **Action:** insert after the built-in agents exist (`seed.ts:514-516`), guarded against duplicates.
- **Traps that apply:** e2e 04 asserts the newest run shows "2 findings" and one card after the CRITICAL filter (`e2e/specs/04-pr-findings.flow.json`); seed-dependent `.it` tests (`grep -ln seed server/test/*.ts`) must stay green.
- **Acceptance:** `pnpm db:seed` twice → stable counts (accepted ≥ 6, dismissed ≥ 4); `POST /findings/:id/eval-case` on each seeded decided finding → 201; the seed-dependent `.it` tests green.

## T10 — `verify:l06` script (server checkpoint)
- **Executor / Type / Depends-on / Risk:** implementer / backend / T1–T9 / low
- **Checkpoint:** yes (server full suite)
- **Covers:** AC-41
- **Fixed decisions:** script text exactly `vitest run src/modules/eval/scoring.test.ts src/modules/eval/frozen-input.test.ts src/modules/eval/executor.test.ts test/eval-contract-parity.test.ts test/contracts.test.ts test/eval.it.test.ts`; no dependency change.
- **Owned paths:** `server/package.json`
- **Action:** add the script; run the full server suite once.
- **Traps that apply:** lockfile must not change.
- **Acceptance:** `env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u OPENROUTER_API_KEY pnpm verify:l06` exits 0; a flipped assertion in `scoring.test.ts` → non-zero (revert); `pnpm test` and `pnpm typecheck` green.

## T11 — Client API, hooks, formatting, base i18n
- **Executor / Type / Depends-on / Risk:** implementer / ui / T1 / medium
- **Covers:** AC-17, AC-25, AC-28, AC-29, AC-40 (display helpers)
- **Fixed decisions:** contract imports are `import type` only; runs list polls every 2 s while any run is `running`; `formatMetric(null) = "—"`; deltas carry sign + arrow.
- **Owned paths:** `client/src/lib/api.ts`, `client/src/lib/hooks/eval.ts`, `client/src/lib/hooks/eval.test.tsx`, `client/src/lib/eval-format.ts`, `client/src/lib/eval-format.test.ts`, `client/messages/en/eval.json`
- **Action:** `api` methods for every endpoint; hooks listed in plan T11 with invalidations; formatting helpers; base i18n keys (keep existing ones).
- **Traps that apply:** runtime import from the shared barrel 500s under webpack (`client/INSIGHTS.md:137`); `apiFetch` content-type quirk for body-less POSTs (`client/INSIGHTS.md:123`); never `pnpm build` while `next dev` runs (`client/INSIGHTS.md:147`).
- **Acceptance:** `cd client && pnpm exec vitest run src/lib/eval-format.test.ts src/lib/hooks/eval.test.tsx` green; `pnpm typecheck` green.

## T12 — FindingCard: Turn into eval case / case tag
- **Executor / Type / Depends-on / Risk:** implementer / ui / T11 / medium
- **Covers:** AC-1, AC-2, AC-5, AC-6, AC-7, AC-8, AC-10, NFR a11y
- **Fixed decisions:** one click, no dialog; disabled reasons "Accept or dismiss this finding first" / no producing agent, exposed via `aria-describedby`; tag `must_find`/`must_not_flag` replaces the button when linked; placed after the Accept / Reject buttons.
- **Owned paths:** `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/**`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/InlineFinding/InlineFinding.tsx` (the two verified `FindingCard` renderers), `client/messages/en/prReview.json`
- **Action:** `FindingCard/_components/EvalCaseAction/`; pass `agentId` (from the review) and the link map from `useEvalCaseLinks(prId)` down from the renderers; toast on created / already exists.
- **Traps that apply:** `user-event` not installed → `fireEvent` (`client/INSIGHTS.md:97`); click must not bubble to a clickable parent (`client/INSIGHTS.md:79`); `vi.mock` path fragility (`client/INSIGHTS.md:183`).
- **Acceptance:** `pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components"` green with the plan T12 cases; `pnpm typecheck` green.

## T13 — Shared run components
- **Executor / Type / Depends-on / Risk:** implementer / ui / T11 / low
- **Covers:** AC-28, AC-29, AC-30, NFR a11y
- **Fixed decisions:** promoted to `src/components/` because two routes use them; text rendered as plain text; checkbox name "Select run v<version>, <YYYY-MM-DD HH:mm>".
- **Owned paths:** `client/src/components/eval-run-history/**`, `client/src/components/eval-run-detail/**`, `client/messages/en/eval.json`
- **Action:** `EvalRunHistory` (newest first, optional selection, running row "k / n cases") and `EvalRunDetail` (metrics, `p / n`, cost + partial marker, duration, per-case outcomes `matched|missed|noise|unlabeled|dropped`).
- **Traps that apply:** `fireEvent` only; no `dangerouslySetInnerHTML`/markdown.
- **Acceptance:** `pnpm exec vitest run src/components/eval-run-history src/components/eval-run-detail` green (out-of-order runs sorted; five outcome labels; `—` for null; partial-cost marker, never `$0`; checkbox by name).

## T14 — AgentEditor Evals tab
- **Executor / Type / Depends-on / Risk:** implementer / ui / T13 / medium
- **Covers:** AC-11, AC-12, AC-13, AC-17, AC-19, AC-28, AC-30, AC-38
- **Fixed decisions:** tab `evals` after Context, `?tab=evals`; read-only case view (no editor, OQ-11); delete needs confirm.
- **Owned paths:** `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/**`, `client/messages/en/agents.json`, `client/messages/en/eval.json`
- **Action:** `EvalsTab` with `CaseList`, `CaseViewModal`, `RunPanel`, `EvalRunHistory` + `EvalRunDetail`, "View in eval dashboard →" link.
- **Traps that apply:** tab switches keep `<main>` scrollTop (`client/INSIGHTS.md:37`); `fireEvent` only.
- **Acceptance:** `pnpm exec vitest run "src/app/agents/[id]/_components/AgentEditor"` green with the plan T14 cases; existing AgentEditor tests green.

## T15 — Sidebar item + Eval Dashboard page
- **Executor / Type / Depends-on / Risk:** implementer / ui / T13 / medium
- **Covers:** AC-34, AC-35, AC-36, AC-38, AC-39 (optional UI)
- **Fixed decisions:** D6; one-line sanctioned edit to `src/vendor/ui/nav.ts` (SKILLS LAB, key `eval`, href `/eval`) — say so in the commit body; `page.tsx` thin; inline-SVG sparkline, no chart lib.
- **Owned paths:** `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/nav.test.ts`, `client/messages/en/shell.json`, `client/src/app/eval/page.tsx`, `client/src/app/eval/_components/**`, `client/messages/en/eval.json`
- **Action:** nav item + test; `EvalDashboardView` with `AgentCard`, `RecentRunsTable`, empty/loading/error states, optional Run all with started/skipped report.
- **Traps that apply:** Server Component importing `@devdigest/ui` crashes `next dev` (`client/INSIGHTS.md:68`); `/eval` active key already mapped (`client/src/components/app-shell/helpers.ts:38`); icon name must exist in `src/vendor/ui/icons`.
- **Acceptance:** `pnpm exec vitest run src/components/app-shell src/app/eval/_components` green with the plan T15 cases.

## T16 — Per-agent view + Compare modal (client checkpoint)
- **Executor / Type / Depends-on / Risk:** implementer / ui / T15 / medium
- **Checkpoint:** yes (client full suite)
- **Covers:** AC-30–AC-33, AC-37, AC-38, AC-40, NFR a11y
- **Fixed decisions:** Compare enabled only with exactly two selected; old/new by time (server `GET /eval-runs/compare`); no Promote; "same config" note; prompt diff as text lines.
- **Owned paths:** `client/src/app/eval/agents/[agentId]/**`, `client/messages/en/eval.json`
- **Action:** `EvalAgentDetailView` with breadcrumb, back link, agent switcher, `MetricTiles`, `TrendChart`, `RegressionBanner`, selectable `EvalRunHistory`, Run eval, `CompareModal` (focus trap, Escape), empty state for cases-but-no-runs; then the full client suite.
- **Traps that apply:** `fireEvent` only (`client/INSIGHTS.md:97`).
- **Acceptance:** `pnpm exec vitest run "src/app/eval/agents"` green with the plan T16 cases; then `cd client && pnpm test` and `pnpm typecheck` green.

## T17 — e2e flow (write; parent runs)
- **Executor / Type / Depends-on / Risk:** implementer writes, parent runs / e2e / T9, T16 / medium
- **Covers:** AC-34 (e2e navigation), AC-1/AC-5/AC-11 end to end
- **Fixed decisions:** never press *Run eval* (paid); data = T9 seed.
- **Owned paths:** `e2e/specs/15-eval-pipeline.flow.json`
- **Action:** PR #482 → older General-agent run → *Turn into eval case* on an accepted finding → `must_find` tag → sidebar *Eval Dashboard* (highlighted) → General agent → Evals tab lists the case. Follow `e2e/AGENTS.md`, `e2e/docs/writing-flows.md`.
- **Traps that apply:** exact names (`e2e/INSIGHTS.md:85`); scroll into view before clicks (`e2e/INSIGHTS.md:94`); wait for list fetch after `wait --url` (`e2e/INSIGHTS.md:29`); secrets not isolated (`e2e/INSIGHTS.md:51`); rate limit late in fast runs (`e2e/INSIGHTS.md:112`).
- **Acceptance:** `./scripts/e2e.sh` green for all flows 01–15 (parent).

## T18 — Prompt-sensitivity experiment (parent + user, paid)
- **Executor / Type / Depends-on / Risk:** parent / validation / T10, T16 / medium
- **Covers:** AC-31 demo; homework "changing the prompt visibly moves recall/precision"; NFR 3-minute run
- **Fixed decisions:** ≥ 8 cases (≥ 3 `must_not_flag`) created by one click each; baseline prompt ×2, improved prompt ×2, deliberately broken prompt ×1; restore the original prompt afterwards.
- **Owned paths:** none in the repo
- **Action:** run the sequence, Compare old vs broken and old vs new on `/eval/agents/<id>`, take the screenshot(s), record run ids/metrics/cost/duration for T20.
- **Traps that apply:** detailed prompts can make comparisons vacuous (`server/INSIGHTS.md:41`); erratic deepseek latency (`server/INSIGHTS.md:294`).
- **Acceptance:** broken prompt shows lower precision with signed delta and the regression banner; runs finish within 3 min; screenshot saved.

## T19 — Insights sweep
- **Executor / Type / Depends-on / Risk:** parent / docs / T18 / low
- **Covers:** AGENTS.md "Recording insights"
- **Owned paths:** `server/INSIGHTS.md`, `client/INSIGHTS.md`, `e2e/INSIGHTS.md`, `INSIGHTS.md`
- **Action:** apply `engineering-insights`; append-only; Session Notes per touched package.
- **Acceptance:** each new entry has `path:line` evidence and a `date +%F` date.

## T20 — Delivery log, commits, self-review
- **Executor / Type / Depends-on / Risk:** parent / completion / T19 / low
- **Covers:** AGENTS.md phase 5
- **Owned paths:** `specs/eval-pipeline.md` (`## Delivery log` only), `specs/eval-pipeline.plan.md` (`## Delivery log` only)
- **Action:** logical commits on `lesson-06/homework` (shared-contract and `nav.ts` edits called out); Delivery log entries per phase with commits, `pnpm verify:l06`, client `pnpm test`, e2e, experiment numbers, review outcomes; run `/pr-self-review` by hand.
- **Acceptance:** Delivery log present; `/pr-self-review` PASS.
