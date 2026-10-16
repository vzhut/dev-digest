# Run analysis — Multi-Agent Review (worktree A), 2026-10-13 → 2026-10-14

Purpose: a self-contained record of one full SDD run (spec → plan → implementation → review → fix loop → user-driven UI polish) so the next chat can analyse the workflow without re-deriving anything. Facts only; every number comes from a harness `task-notification`, a command output saved in `logs/`, or a file in this repo. Where something could not be measured it says so.

Short ledger entry for the same run: `docs/retro/ledger.md` (entry "Multi-Agent Review", plus two "Correction" lines at its end).

## 1. How to use this folder in the next chat

| Want to know | Read |
|---|---|
| What was asked and decided | `specs/2026-10-13-multi-agent-review.md` (approved, 44 ACs, "Iteration 1 scope", "Deferred") |
| How it was planned | `specs/2026-10-13-multi-agent-review.plan.md` (+ `.tasks.md`, `## Delivery log` at the end) |
| What the agents did, step by step | this file §3–§7 |
| Raw agent transcripts | outside the repo, see §10 (not copied: the copy was denied by the permission classifier) |
| The exact diff the reviewers saw | `diffs/review-full-phase-b.diff` (3980 lines, base `2d78769`) and `diffs/fix-round-1.diff` |
| Test/typecheck evidence | `logs/` |
| What the UI looked like when checked | `screenshots/` |

## 2. Outcome and current state

Delivered (uncommitted, branch `emdash/multi-agents-rview-q9gd4`, HEAD `2d78769`): parallel multi-agent run (`agent_ids`), parent/child runs, grouping + "Where agents disagree", Columns/Tabs results page, Configure run, PR-page picker, "Last multi-agent run" button, Learn, shared RunTraceDrawer/FindingCard, one migration. Not delivered: see §8.

Repository state at the end of the run:
- `git status`: 29 deleted (moved components), 39 modified, 17 untracked; 60 paths under `client/`, 20 under `server/`, plus `specs/` and `docs/retro/`. **Nothing is committed.**
- Migration `server/src/db/migrations/0018_freezing_kingpin.sql` was applied to the **shared local dev database** (`devdigest-postgres`, port 5432) because a fresh worktree has no `server/.env`. That database now has the new columns and one `multi_agent_runs` row (repo `burnjohn/quick-blog`, PR #23, created by the user's own run, `finished_at` is NULL: the API restarted mid-run).
- Processes left running from this worktree: API (`tsx watch`) on :3001, Next dev on :3000, Docker `devdigest-postgres`.
- `agent-runner/` typecheck has one error not caused by this work: `agent-runner/src/run.ts:124` (`string[]` not assignable to `PromptSkill[]`); `agent-runner/` and `reviewer-core/` have no diff.

Verification state (see §6): typecheck + existing suites green; the new behaviour has **no automated tests by decision**, and the manual checklist M1–M37 in the plan (T12) and the "1 vs 3" measurement (T11, AC-31/32, needs a real LLM key and costs money) were **not run**. The UI was checked in a real browser only for: last-run results (Columns, Tabs, disagreement block), empty Configure run, the PR-page header button, the run header.

## 3. Timeline

Dates 2026-10-13 unless noted. Agent ids are the harness ids (their transcripts are listed in §10).

| # | Step | Who | Result |
|---|---|---|---|
| 1 | User supplies requirements (uk) + 7 screenshots; asks for a spec via the spec agent | spec-creator `a2cb…` | Spec written, **into the main checkout** (`Documents/AI Course/dev-digest/specs/`), draft, 32 ACs; 10 open questions; claims "parallel run is ready" and "grouping heuristic exists" shown false (`run-executor.ts:133` sequential; no heuristic in repo) |
| 2 | User hands over the Claude Design bundle (`DevDigest Design (standalone) (3).html`, 1.8 MB) | parent | Unpacked (base64 manifest → ≈45 files) into scratchpad; relevant screens: `screen_multiagent.jsx`, `screen_trace.jsx`, `FindingCard`. **Configure run and the PR picker are not in the bundle** |
| 3 | Interactive questions (3 rounds, 10 decisions) | parent ↔ user | see §4 |
| 4 | Spec updated 6 more times by resume (decisions, Learn restored, embedding, drawer reuse, planner findings, simplification) | spec-creator | 38 → 42 ACs; one resume killed by an API rate limit mid-edit, resumed with "do not redo finished work" |
| 5 | User: "move it to the worktree, clean main" | parent | copied into the worktree, `main` restored; from then on every agent prompt carried the worktree path |
| 6 | First planner run | implementation-planner `ae0a…` | **No plan**: spec was `Status: draft`; 4 questions + a requirements review (138k tokens) |
| 7 | User approves; 4 decisions | parent ↔ user | spec patched to `approved`; plan written (16 tasks, single-agent) |
| 8 | User: "make it very simple" | spec-creator, planner | spec: AC-39 deferred + 8 smaller items; plan 16 → 12 tasks |
| 9 | User: "multi-agent, max 3–5 implementers, no tests by implementers, only architecture-reviewer + plan-verifier, fix loop max 2 subagents" | planner | plan: 2 implementers, 37 manual checks M1–M37 replace tests |
| 10 | `/run-plan` | parent | env precheck: Docker down, no `node_modules` → asked user once; baseline green |
| 11 | Wave 1 | IMPL-SERVER `a8c7…` | T1 contracts + schema + migration 0018 |
| 12 | Wave 2 (parallel) | IMPL-SERVER T2–T5, IMPL-CLIENT `a886…` T6–T10 | both done first pass |
| 13 | Phase B (parallel) | architecture-reviewer `a88f…`, plan-verifier `afe7…` | §6 |
| 14 | Fix round 1 (1 of cap 1; 1 of 2 dispatches) | IMPL-CLIENT | 5 PARTIAL + AC-1 heading + drawer `key` |
| 15 | Incremental re-review | arch-reviewer `a72b…`, plan-verifier `adc9…` | 7/7 PASS, 0 CRIT/HIGH |
| 16 | Delivery log written; user: "fix what needs fixing" | parent (inline) | carried MEDIUM/LOW fixed (dedup helpers, i18n of formatters, tablist, `useDismiss`, `startReview`) |
| 17 | 2026-10-14 user reports: can't return to last run from the sidebar; no link from the PR page; UI doesn't match design; toggle "does nothing"; no PR title; total looks wrong | parent + IMPL-CLIENT | §7 |
| 18 | `/workflow-retro` | parent | ledger entry + corrections |

## 4. Decisions (user) and why

| Decision | Source of the choice | Consequence |
|---|---|---|
| Real parallel execution in `run-executor` (≤ 10 agents, all at once) | spec claimed "ready", code was sequential | `Promise.allSettled`, `finally` stamps parent duration |
| Grouping rule: same file + line overlap/≤2 + category or ≥50% title words; transitive; same-agent never a direct link | no heuristic existed | pure `reviews/multi-agent.ts` |
| Picker: enabled agents; PR menu all checked, Configure run none checked + Select all | spec question | `lib/agent-selection.ts` |
| Learn **required** (not disabled, not dropped); "Reply to author" out | user reversed an earlier removal | `POST /findings/:id/learn`, first transaction in the codebase |
| Learn stores no embedding | cost/offline | nullable column |
| Drawer reused as is; only `grounding_dropped` added under Stats | simplicity | Stop-run button and drawer error display deferred (AC-39) |
| `queued` is a client display state, no DB status | simplicity | contracts widened additively |
| Workspace scoping on cancel/trace kept (AC-42) | user kept it when offered to cut | 404 for foreign runs; SSE route still unscoped (accepted risk) |
| Cut: seed on PR #482, e2e flow 16, fancy estimate rules | "very simple first iteration" | estimates = average of last 5 successful local runs |
| Workflow: 2 implementers (cap 3), implementers write no tests, only arch-reviewer + plan-verifier afterwards, fix-cap 1, ≤ 2 fix dispatches | cost control | §6 consequences |
| After Phase E, spec gaps fixed on request: AC-3/AC-24 (sidebar reopens the last run), AC-43/44 (latest-run endpoints, PR-page button) | user found them in the UI | server `GET /repos/:id/multi-agent-runs/latest`, `GET /pulls/:id/multi-agent-runs/latest` |

## 5. Spec and plan evolution (cost of churn)

- Spec: 1 creation + 7 edit passes by `spec-creator`, then 3 direct edits by the parent (AC-3/AC-24, AC-43, AC-44). 32 → 44 ACs; 385 lines at the end.
- Plan: first run produced no plan (138.4k tokens, clarification); plan written 3 times: 16 tasks (222.9k cumulative) → 12 tasks (284.8k) → 12 tasks multi-agent, no tests (341.2k).
- Opus tokens after the first spec (157.3k) and first plan (222.9k): ≈ 294k of ≈ 674k (44%). Part of that was caused by genuine user decisions, not rework.

## 6. Verification evidence

Baseline before wave 1 (parent): server typecheck clean, 527 unit tests; client typecheck clean, 467 tests (`logs/baseline-*.log`).

After implementation and at the end (parent, repeated): server typecheck clean, 527 unit; server `.it` 24 files / 132 tests green when each file/group runs sequentially (`logs/server-it-7-files-sequential.log`: 7 files / 20 tests); client typecheck clean, 467 tests; mcp-server 118 tests; reviewer-core build clean.

**Flaky, not a regression:** the full `.it` run in parallel failed 4–7 of 24 files each time (`logs/server-it-full-parallel-flaky.log`: `Hook timed out in 120000ms`, one container exit 137, 7.7 GiB Docker); the same files pass with `--no-file-parallelism`. Recorded in `server/INSIGHTS.md`.

Phase B (full diff, sonnet):
- architecture-reviewer: CRITICAL 0 / HIGH 0 / MEDIUM 1 / LOW 2. MEDIUM: three identical selection helpers duplicated in two routes. LOW: hand-rolled dismiss effect in `RunReviewDropdown`; `POST /pulls/:id/review` handler branching with two service calls. Question (low confidence): Learn writes `memory` from the reviews repository (no memory module exists yet).
- plan-verifier: 37 PASS (all "code-only", no new tests), 5 PARTIAL, 0 MISSING, 3 UNVERIFIED (AC-31/32 measurements, NFR performance), 1 DEFERRED (AC-39). PARTIAL: AC-4 (no empty state before a PR is chosen), AC-7/AC-9 ($0.200 vs $0.20), AC-23 (tabs showed finding count not score), AC-27 (wording). Risk noted: drawer without `key` (AC-28/41).
- Re-review after fix round 1: architecture MEDIUM 1 (hard-coded English in `lib/multi-agent-format.ts`) / LOW 1 (tablist roles without tabpanel/keys); verifier 7/7 PASS.

## 7. Defects found after the loop closed (not by any review agent)

| Defect | Found by | Introduced by / cause |
|---|---|---|
| Sidebar link always showed Configure run; no way back to the last run | user | **spec** (AC-24 said so) |
| No link from the PR page to a run | user | spec/plan gap (no entry-point review) |
| Columns/Tabs switch had no active state | user (screenshot) | implementer used `Button active`, which doesn't change the look |
| Agents had no icon/colour as in the design | user | design relies on per-agent identity the data model lacks; derived from the agent name in `lib/agent-appearance.ts` |
| "Back to last run" never appeared | parent (browser) | parent: latest-run query disabled while configuring |
| Empty total line "≈ — · — · parallel fan-out" | parent (browser) | implementer/spec |
| "Show only conflicts" appears to do nothing | user | correct per AC-21 on this data (all 12 locations had exactly 1 flagger + others "did not flag", so all are conflicts); no feedback → counter added |
| No PR title in the run header | user | contract lacked `pr_title` |
| Cost "<$0.01" hid a real $0.0096; total time "—" | user | local formatter + parent never finished (API restart killed the run); fallback = slowest child |

Why the verifier did not catch them: it checks the spec's ACs against code; none of the above violated an AC as written, and nobody opened a browser until the parent did.

## 8. Not done / known gaps (carry into the next chat)

- No automated tests for: grouping rule (AC-18), Learn idempotency/transaction (AC-37/38), parallel isolation (AC-12–14), workspace 404s (AC-42), the two `latest` endpoints, UI behaviour.
- Plan T12 (manual checklist M1–M37) and T11 (1-vs-3 measurement, `specs/2026-10-13-multi-agent-review.measurements.md` does not exist) not run. AC-31/32 remain UNVERIFIED.
- Not seen in a browser: Configure run with a PR selected, a run in progress/queued/failed live, the PR-picker rows with agent icons, a conflict filter that actually hides something.
- Not run: `next build`/webpack check (implementers were forbidden; parent skipped), `/pr-self-review`.
- Cancelling a single agent is possible only through the API: the PR page's Cancel stops all live runs of the PR.
- Picker replaced the one-click "Run all enabled"; child runs still appear flat in the PR page's Agent runs tab.
- `AC-13` in the spec still says an unfinished parent shows "—"; code now uses the slowest child once all children have settled.
- Run-header `pr_title`/`summary` appear only if the server provides them; Tabs summary shows when `column.summary` exists.
- Agent colour/icon are heuristics from the agent name (6-colour hashed fallback).
- Architecture MEDIUM/LOW from the last re-review were later fixed inline by the parent; no review agent re-checked those later edits or the post-loop changes (latest endpoints, polish, counter, `pr_title`).
- A `server/.env` now exists in the worktree (git-ignored). The IMPL-SERVER report said a fresh worktree had none; who created it afterwards was not traced.

## 9. Cost and models

Models from `.claude/agents/*.md`: spec-creator opus, implementation-planner opus, implementer sonnet, architecture-reviewer sonnet, plan-verifier sonnet (`/run-plan` also pins the two reviewers to sonnet). spec-creator's opus is also confirmed by the rate-limit error text.

Per-notification `<usage>` values (tokens / tool uses / duration). Tokens look cumulative across continuations of the same agent (monotonic); tool uses and duration are per notification.

| Agent | Notifications |
|---|---|
| spec-creator `a2cb…` (opus) | 157,324/34/318s · 202,889/18/174s · 230,931/43/173s · 233,458/47/209s · 249,032/17/77s · 285,629/34/148s · (rate-limit failure, no usage) · 332,554/17/64s |
| implementation-planner `ae0a…` (opus) | 138,411/14/160s · 222,860/22/488s · 284,845/6/301s · 341,211/6/287s |
| IMPL-SERVER `a8c7…` (sonnet) | 113,142/16/178s · 172,183/37/525s |
| IMPL-CLIENT `a886…` (sonnet) | 209,706/55/566s · 218,542/5/96s · 280,371/18/233s |
| architecture-reviewer `a88f…` (sonnet) | 129,621/13/69s |
| plan-verifier `afe7…` (sonnet) | 147,518/25/284s |
| architecture-reviewer re-review `a72b…` (sonnet) | 59,503/5/29s |
| plan-verifier re-verify `adc9…` (sonnet) | 49,942/8/66s |

Totals (last token figure per agent): ≈ 1.51M; opus ≈ 674k (44%), sonnet ≈ 839k (56%); summed agent time ≈ 74 min (parallel overlap in wave 2 and Phase B; wall-clock not measurable). **No dollar cost can be derived**: no input/output/cache split, and the parent session's own tokens are not in these notifications. If tokens are per-spawn rather than cumulative, the true total is ≈ 2.5× larger.

## 10. Where the raw logs are

**Transcripts are NOT in this folder.** An attempt to copy them from `~/.claude/` into the repo was denied by the permission classifier ("sensitive-source provenance") and was not worked around. A regex scan of all nine files (API-key shapes and `TOKEN|SECRET|PASSWORD|API_KEY=value`) found no secrets: the only hits were the memory file name `ask-before-committing-…` matching `sk-`, the scan pattern itself, and `PASSWORD: dev…` (the docker-compose local default). The scan is pattern-based, not a guarantee.

They are persisted by Claude Code under `~/.claude/projects/-Users-volodymy-rzhutenko-emdash-worktrees-dev-digest-95942142-emdash-multi-agents-rview-q9gd4/`:
- main session: `8d741879-5cb8-4128-a6a2-cf68b2ae20d8.jsonl` (≈ 9.6 MB)
- subagents: `8d741879-5cb8-4128-a6a2-cf68b2ae20d8/subagents/agent-<id>.jsonl` + `.meta.json` for `a2cb29464ee4506fe` (spec-creator, 7.2 MB), `ae0ad708d86d39cc0` (planner, 2.3 MB), `a8c711f3d5b3ffef1` (IMPL-SERVER, 1.0 MB), `a8864147088ca5dbe` (IMPL-CLIENT, 1.6 MB), `a88fafd6ea0de08f0` (architecture-reviewer, 0.6 MB), `afe7e58fdf3f5fc67` (plan-verifier, 0.8 MB), `a72bdfcbc385c991d` (re-review, 0.3 MB), `adc99531dd247bb1e` (re-verify, 0.3 MB).

Copied here (all confirmed to belong to this worktree by the path inside the log): `logs/*.log` and `logs/misc/` (dependency install output for server/client/mcp-server/agent-runner/reviewer-core; the output of the `pnpm dev` start attempt that failed with EADDRINUSE because an API from this worktree already held :3001).

**Deliberately not copied: other sessions' logs.** `/tmp` also holds logs whose paths point at a different worktree (`.../emdash-export...`): `b-a`, `b-c`, `b-s`, `b2-c`, `b2-s`, `f-a`, `f-c`, `f-s`, `ins-*`. They are not part of this run and were excluded so they are not mis-attributed to it.

**Not saved anywhere as a file:** the full text of each agent's hand-back report (spec-creator's open-question lists, the verifier's 46-item table with path:line evidence, the architecture findings tables). They exist in the transcripts and, for this document, only as the summaries in §3 and §6.

Scratchpad (temporary, may disappear): the unpacked design bundle (`.../scratchpad/design/`, the source for §3 step 2), `edit.py`, `unpack.py`, tmp index files.

## 11. Questions worth analysing next

1. Where did the 7 spec edit passes and 3 plan writes come from, and which constraints could have been asked up front (see ledger proposals 2–3)?
2. Would a browser smoke inside Phase B have caught §7's defects before the user did, and at what token cost?
3. Is "no tests by implementers" the right trade-off for Learn/grouping, given they only passed on code reading? (A single `.it` test for Learn idempotency was proposed and not written.)
4. Should the verifier receive the design/screenshots as a second source of truth, not only the spec?
5. Is the cumulative-vs-per-spawn question for `subagent_tokens` answerable from the transcripts (compare `usage` blocks inside `agent-*.jsonl`)?
6. Cost: the parent session's own tokens are missing; can they be taken from the main `.jsonl`?

## 12. Addendum — tests and final review (2026-10-14, after §1–§11 were written)

The user lifted the "no tests" rule. Two `test-writer` agents ran in parallel: server `afeb1f2aefb7d0e09` (206,958 tokens, 28 tool uses, 573 s; sonnet) and client `afebde69d8a52e402` (167,777 tokens, 40 tool uses, 576 s; sonnet). New: server 57 hermetic + 22 `.it`, client 78 tests (467 → 545).

Real production bugs found by the tests (the client agent found none), both fixed by the parent:
1. Cancel during an in-flight LLM call was overwritten with `done` (AC-34). First fix attempt (`isCancelled` re-check after the engine returns) did not work: `RunBus.complete()` deletes the cancel flag (`server/src/platform/sse.ts:79`) and `cancelRun` calls it immediately. The working signal is `isCancelled || isComplete` (`run-executor.ts`). Affected single-agent cancels as well.
2. Learn on a finding whose agent was deleted stored the stale agent id (`service.ts`, now `agent?.id ?? null`).

Final state verified by the parent: server typecheck clean; unit 55 files / 584; `.it` run sequentially 26 files / 154; client typecheck clean, 112 files / 545; mcp-server 118; reviewer-core 88; agent-runner only the pre-existing error. A hermetic timing test (`project-docs-fs`) failed once under load and passed on its own.

Final review on the whole diff (149 files, ≈10.4k lines added, fresh sonnet agents): architecture-reviewer `aa1fa4f485458665e` 144,431 tokens / 32 tool uses / 127 s → CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 3; plan-verifier `af7f32b33a4b25cd5` → PASS 36 / PARTIAL 9 / MISSING 0 / UNVERIFIED 2 / DEFERRED 1 (it did not re-run suites: the parent handed it the green results, which tests ledger proposal "hand the verifier the parent's last green run"). Its PARTIAL list and the LOW findings are in the plan's Delivery log.

Test gaps still open: AC-14 and NFR-Obs (no production seam), AC-10 label, AC-22 six-column scroll, AC-23 actions / absence of Reply, AC-25, AC-28 (drawer mocked), AC-41, NFR-Perf zero-LLM-calls. Still not run: manual checklist M1–M37, the 1-vs-3 measurement (AC-31/32), `next build`, `/pr-self-review`.
