# Workflow retro ledger

Manual-only retrospectives over multi-agent Claude Code workflows — cost, order, friction and
proposals for the orchestration itself, not the code it produced. Run by hand: `/workflow-retro`
(in-context) or `/workflow-retro deep` (also mines git log, Delivery log entries and `INSIGHTS.md`
diffs from the run). Append only — never rewrite or delete an entry. See
`.claude/skills/workflow-retro/SKILL.md`.

### Project Context spec — spec-creator phase — 2026-10-01

Mode: default · Agents: 1 · Total tokens: ~137k · Wall time: ~4m30s · Fix-loop rounds: n/a (spec
phase only, no implementation-planner/implementer ran yet)

| # | Agent | Model | Tokens | Tool uses | Duration | Status |
|---|---|---|---|---|---|---|
| 1 | spec-creator | opus | 137,241 | 28 | 4m30s (270,173ms) | done — draft + 11 `[NEEDS CLARIFICATION]` items (by design) |

**Went easily:** One pass, no re-spawn, no `Status: blocked`. It found most of the required
plumbing already existed unused in the repo (`reviewer-core/src/prompt.ts`'s `## Project context`
renderer, `run-executor.ts`'s dead `specs_read: []`, unused client hooks `useContextFiles` /
`useReindexContext`) rather than guessing at new contracts — settled the one real design question
(reviewer-core gets `{path, text}`, no FS access) by reading code, no `researcher` delegation
needed.

**Had difficulty:** Not the agent — the parent/session side took 3 rounds with the user before the
spec stabilized: (1) the initial batch of `AskUserQuestion` calls resolving the 11 open questions,
(2) a correction round after the parent prematurely set `Status: approved` right after the open
questions were answered — the user pushed back ("поверни draft, я сам підтверджу коли буде
готово"), a process misstep since "open questions resolved" ≠ "spec approved", (3) a second
substantive round where the user reversed 2 of the already-"resolved" decisions after seeing them
written out (no version bump at all, vs. the first pass's "yes for agents"; a single "used by N
agents" count, vs. the first pass's `{agents, skills}` split) plus 3 more clarifications (editing
feasibility, missing-doc handling, the chunks→tokens footer wording).

**Duplicated:** None across agents — only one agent ran this phase. The parent applying the user's
answers by hand-editing the spec (≈15 targeted `Edit` calls across two rounds) rather than
re-spawning `spec-creator` for mechanical updates avoided a second ~137k-token agent call; worth
keeping as the default move for post-approval-question edits, not a duplication to fix.

**Missed / caught late:** n/a — no downstream reviewer (`plan-verifier`/`architecture-reviewer`)
has run yet; the workflow hasn't reached a phase where "caught late" is observable.

**Proposals:**
- `spec-creator`'s recommended defaults skewed toward completeness over simplicity on 2 of 11
  questions (an 8k/24k token budget, and a version bump on agent context changes) — both got
  overridden by the user toward "no extra mechanism" when asked directly, and a stated project
  preference ("найлегшу імплементацію") predicted both reversals. Next spec, when a requirement
  doesn't itself state a constraint, bias the recommended default toward the simplest/no-mechanism
  option and label it `(simplest)` explicitly, so more of the first `AskUserQuestion` pass sticks
  and a second revision round isn't needed for the same questions.
- Add an explicit rule (to `.claude/agents/README.md`'s spec-creator section, or the parent's own
  checklist) that resolving `[NEEDS CLARIFICATION]` items never auto-promotes `Status` to
  `approved` — that needs the user's own word, not inferred from "all questions answered". This
  session needed one extra correction turn for exactly that gap.
- Two of the "resolved" decisions from the first `AskUserQuestion` round were reopened and reversed
  in a second round after the user saw them written into the spec text. Consider a lighter-weight
  first pass — present only the questions where the spec's own default is genuinely load-bearing
  (repo scope, doc revision, budget) — and defer minor polish questions (wording, footer labels,
  used-by granularity) to after the user has read the full draft once, instead of batching all 11
  up front.

### Project Context (specs/2026-10-01-project-context.md — plan → run-plan → live check → pr-self-review) — 2026-10-01

Mode: default · Agents: 28 spawns · Total tokens: ~3.29M (last `task-notification` figure per agent, not summed across continuations) · Wall time: ~3.5h elapsed (includes waiting on Docker and the user's visual review); summed agent time ~2h21m (counting every continuation) · Fix-loop rounds: 3 (+ a user-driven restyle/Edit scope change)

| # | Agent | Model | Tokens | Tool uses | Duration | Status |
|---|---|---|---|---|---|---|
| 1 | implementation-planner (+2 continuations) | opus | 280k | 41→45→6 (counts not cumulative) | 220s+578s+239s | stopped at 40-turn limit with 0 files; resumed twice; done |
| 2 | spec-creator (13 issues) | opus | 96k | 32 | 115s | done |
| 3 | implementer T1 contracts | sonnet | 104k | 6 | 43s | done |
| 4 | implementer T2 migration | sonnet | 92k | 11 | 37s | done (migrate deferred: no Docker) |
| 5 | implementer T3 reviewer-core (+1 fix) | sonnet | 104k | 10+6 | 57s+30s | done; fix: 5 server tests on old `specs` shape |
| 6 | implementer T4 ProjectDocs adapter | sonnet | 103k | 9 | 85s | done |
| 7 | implementer T5 helpers | sonnet | 94k | 7 | 37s | done |
| 8 | implementer T8 client hooks (+1 fix) | sonnet | 108k | 6+7 | 59s+164s | done; fix: webpack barrel import |
| 9 | implementer T13 trace drawer | sonnet | 97k | 5 | 30s | done |
| 10 | implementer T9 checklist/preview | sonnet | 117k | 12 | 122s | done |
| 11 | implementer T10 page (+6 continuations) | sonnet | 199k | 21,7,17,5,9,3,3 | 127s…1279s (sum ~30m) | done; continued for fix round 1, restyle, list rows, Edit UI, rounds 2–3 |
| 12 | implementer T11 agent tab | sonnet | 110k | 12 | 72s | done |
| 13 | implementer T12 skill section | sonnet | 110k | 7 | 58s | done |
| 14 | implementer T6 module (+2 continuations) | sonnet | 176k | 11,14,6 | 111s+2307s+113s | done; 2307s = hung vitest worker |
| 15 | implementer T7 executor (+1 fix) | sonnet | 134k | 15+3 | 121s+34s | done |
| 16 | implementer T14 e2e | sonnet | 104k | 11 | 637s | partial → found webpack regression |
| 17 | implementer T16 docs | sonnet | 96k | 12 | 28s | done |
| 18 | architecture-reviewer #1 | sonnet | 100k | 24 | 96s | LOW 1 |
| 19 | plan-verifier #1 | sonnet | 98k | 22 | 172s | PARTIAL 2 |
| 20 | architecture-reviewer #2 | sonnet | 118k | 23 | 80s | MEDIUM 1, LOW 1 |
| 21 | plan-verifier #2 | sonnet | 77k | 10 | 103s | PASS 55 / UNVERIFIED 4 |
| 22 | architecture-reviewer #3 (after Edit) | sonnet | 95k | 12 | 45s | 0 findings |
| 23 | plan-verifier #3 (Edit ACs + write security) | sonnet | 93k | 15 | 169s | PARTIAL 2 + 1 security residual |
| 24 | architecture-reviewer #4 | sonnet | 168k | 14 | 81s | MEDIUM 1, LOW 1 |
| 25 | plan-verifier #4 | sonnet | 118k | 24 | 266s | PARTIAL 3 (tests only) |
| 26 | spec-creator (Edit + row anatomy) | opus | 112k | 37 | 179s | done |
| 27 | general-purpose reviewer (pr-self-review UI) | inherited | 110k | 19 | 102s | MEDIUM 2, LOW 4 |
| 28 | general-purpose reviewer (pr-self-review backend+security) | inherited | 79k | 11 | 48s | MEDIUM 1 |

**Went easily:** Wave 1 T1/T2/T5 and wave 3–4 T9/T11/T12 were `done` on the first pass in 36–122 s with 5–12 tool uses each; architecture review #3 returned 0 findings (agent #22); no CRITICAL/HIGH finding survived any of the four architecture passes.

**Had difficulty:**
- The planner hit its 40-turn cap with 41 tool uses and wrote no file (first `task-notification`), costing a resume (+43k tokens, +358 s) before the plan existed.
- Docker was down from wave 2 to wave 4: T6/T7 sat unstarted while the parent reported "Docker still not running" six times; T2 could only `db:generate`.
- Agent #14 (T6) ran 2307 s: a test with `'a'.repeat(1 MiB)` hangs js-tiktoken (quadratic). The two orphaned `vitest` workers (PIDs 25241, 26191) kept 99% CPU for ~40 min; the next full server run took 991 s instead of ~35 s and the 10,000-file ≤ 2 s test failed until `kill -9`.
- A webpack-only failure (`context-docs.ts:4` runtime import of the shared barrel) passed vitest, `tsc`, and the T8/T9/T10/T11/T12 DoDs; it surfaced only at wave 5 in T14's e2e run (flows 08–12 → 500).
- Agents ran `pnpm build` in `client/` while the user's `next dev` was up, corrupting `client/.next`; the user hit the Next error overlay twice (`reading 'call'`, `Cannot find module './vendor-chunks/recharts…'`).
- T10's agent was continued 7 times (1813 s total) because scope grew after the user's visual review: layout restyle, list-row anatomy, then the Edit tab.

**Duplicated:**
- Four fresh `architecture-reviewer` runs re-read an almost identical 9.7k-line diff (pc.diff 8,579 → pc4.diff 9,852 lines; 95–168k tokens each) and re-raised the same two items (`node:fs` in `routes.ts`: LOW → MEDIUM; `ProjectContextView.tsx` ~292 lines in rounds 4 and again in pr-self-review `6d5d`).
- Four `plan-verifier` runs plus the parent each re-ran the full server suite (~35 s healthy, 16 min when contended) and client suite.
- The "client cannot import the shared barrel at runtime" rule had to be re-stated to each client agent (T9, T10, T12 prompts) after T8's regression.

**Missed / caught late:**
- T3's DoD said "server stays green" but 5 server tests (`prompt-callers`, `prompt-structured`) passed the old `specs: string[]`; only the parent's wave-1 checkpoint caught them.
- T8's webpack regression (see above) was caught three waves later by e2e, not by the implementer or any reviewer.
- `ContextTab` stale draft (T11) was only surfaced as a low-confidence question in architecture review #1; no verifier or test caught it.
- Edit-tab keyboard operability (NFR Accessibility) and the case-insensitive `.git`/`node_modules` guard were missing in the "done" T10/T6 work and found only by `plan-verifier` #3.
- The original spec described the design only from a text description of four screenshots (spec "Untrusted inputs"); the user's first look at the page (list rows, Edit) produced ~10 continuations and a spec revision (agent #26).

**Proposals:**
- **Webpack smoke at wave 3, not wave 5.** Evidence: T8 regression found at T14 after waves 2–4. Next run: add a client-checkpoint command that builds into a separate dir (`NEXT_DIST_DIR` / `distDir`) or runs the e2e subset for touched routes right after the first wave that adds a client import of `@devdigest/shared`; test: the same barrel mistake fails the wave-3 checkpoint.
- **Never `pnpm build` in `client/` while port 3000 listens.** Evidence: two Next overlays reported by the user, `client/INSIGHTS.md` entry added today. Next run: put a `lsof -i :3000` check in `implementer.md` / run-plan prompts, or give the checkpoint a separate `distDir`; test: no `.next/BUILD_ID` appears while `next dev` is up.
- **Kill orphan test workers after every agent and ban long single-char fixtures.** Evidence: T6 2307 s, suite 991 s vs 35 s, two PIDs at 99% CPU. Next run: parent runs `pkill -f vitest` (after checking no live agent) before each full-suite checkpoint, and the implementer card for token-count tests says "use `'ab '.repeat(n)`, not `'a'.repeat(n)`" (now in `server/INSIGHTS.md`).
- **Planner: write the plan skeleton first.** Evidence: first `implementation-planner` run, 41 tool uses, 0 files. Next run: split the planner call into (a) plan file, (b) task cards, or tell it to write `.plan.md` by turn ~15; test: first notification already has a file on disk.
- **Environment precheck once, before wave 1.** Evidence: Docker-down messages ×6, T6/T7 delayed. Next run: `run-plan` Phase A step 0 runs `docker ps` and the baseline, and asks the user a single AskUserQuestion if any `.it`-dependent task exists; test: no wave starts with a known-missing dependency.
- **Planner "ripple" check for type changes.** Evidence: T3's `specs` type change broke 5 server tests the card said would stay green. Next run: for each task changing an exported type, the card lists the grep'd consumers (tests included) in `Owned paths`; test: wave-1 checkpoint has 0 unexpected failures.
- **Incremental re-review after round 1.** Evidence: four architecture reviews at 95–168k tokens over a ~95%-identical diff. Next run: pass only `git diff` of the fix commits plus the previous finding list; test: re-review tokens drop below ~50k with the same findings caught.
- **Design sign-off with real images before implementing UI.** Evidence: spec built from a text description of screenshots; restyle + Edit cost ~7 T10 continuations and one spec revision. Next run: attach the image files to `spec-creator` (or ask the user for them) and add a visual check (`agent-browser screenshot`) to the first UI task's acceptance; test: no layout-only fix round after the user's first look.

### Onboarding Tour — spec → plan → cross-model review → run-plan (T1–T13) → pr-self-review — 2026-10-02

Mode: default · Agents: 21 spawns (20 completed, 1 died) · Total tokens: ~2.61M (excludes the dead verifier run, no figure reported) · Wall time: not measurable — the run spanned two days with a usage-limit pause and a laptop sleep; sum of agent durations ≈ 2.4 h, of which ≈ 1.2 h is two sleep/background outliers (rows 12, 19) · Fix-loop rounds: 0 from `run-plan` (nothing qualified); 1 from `pr-self-review` (commit `59fcd87`)

| # | Agent | Model | Tokens | Tool uses | Duration | Status |
|---|---|---|---|---|---|---|
| 1 | spec-creator (+3 researchers it spawned, not visible here) | session default | 182k | 25 | 7m42s | done, 0 open questions |
| 2 | implementation-planner | session default | 234k | 32 | 12m17s | done, status `needs decisions` |
| 3 | cross-model reviewer (general-purpose) | opus | 182k | 47 | 5m30s | done, APPROVE WITH CHANGES, F1–F20 |
| 4 | implementer T4 | session default | 88k | 6 | 0m30s | done |
| 5 | implementer T2 | session default | 103k | 7 | 1m02s | done |
| 6 | implementer T1 | session default | 105k | 8 | 1m05s | done |
| 7 | implementer T3 | session default | 110k | 12 | 1m42s | done + 1 question |
| 8 | implementer T8 | session default | 101k | 7 | 0m52s | done |
| 9 | implementer T7 | session default | 102k | 11 | 1m21s | done |
| 10 | implementer T5 | session default | 111k | 8 | 2m10s | done |
| 11 | implementer T9 | session default | 124k | 16 | 2m43s | done |
| 12 | implementer T6 | session default | 149k | 22 | 34m09s | done (outlier, see below) |
| 13 | implementer T10 | session default | 168k | 26 | 5m07s | done |
| 14 | implementer T11 | session default | 156k | 20 | 4m41s | done |
| 15 | implementer T12 | session default | 165k | 21 | 4m21s | done |
| 16 | implementer T13 | session default | 94k | 6 | 0m32s | done |
| 17 | architecture-reviewer | sonnet | 133k | 31 | 2m26s | done, 0/0/2/2 |
| 18 | plan-verifier (run 1) | sonnet | n/a | n/a | n/a | failed — laptop slept mid-response |
| 19 | plan-verifier (run 2) | sonnet | 143k | 25 | 42m47s (sleep-inflated) | done, PASS 62 / PARTIAL 4 / MISSING 0 / UNVERIFIED 3 |
| 20 | pr-self-review reviewer: backend | sonnet | 85k | 12 | 1m01s | done, 1 MEDIUM |
| 21 | pr-self-review reviewer: ui | sonnet | 73k | 7 | 1m03s | done, 1 HIGH + 3 MEDIUM + 2 LOW |

**Went easily:** Waves 1–5: every implementer returned `Status: done` on the first pass, 12 of 13 with no question and no later fix-loop touch of its files (T4/T2/T1/T8/T7/T5/T9/T10/T11/T12/T13; T3 asked one). Disjoint `Owned paths` held: `git status` after each wave showed nothing outside them. The cross-model review earned its cost before any code existed: F1 (SDKs retry twice by themselves, so T2's "one call" was false for OpenAI/Anthropic), F2 (`contracts.test.ts` would have failed at the first checkpoint) and F3 (e2e could make a paid call) were all fixed in the cards, and none of them resurfaced in the code reviews.
**Had difficulty:** T3 blocked on a contradiction I introduced: the card said a depth-1 `churn` gives `commits === 1`, amendment F5 (appended as a separate plan section instead of edited into the card) said boundary commits are excluded, so 0. The agent asked; the parent had to arbitrate. The first `plan-verifier` died on a laptop sleep and the whole 69-item verification was redone (~143k tokens). The second verifier's full `pnpm test` hit Testcontainers "Hook timed out in 120000ms" in 7 unrelated `.it` files (parallel load) and had to re-run four of them by hand. The parent's amendment script failed once on a backtick pattern, which cost a retry.
**Duplicated:** The same ~7k-line diff was read by the architecture-reviewer (133k), the plan-verifier (143k) and two `pr-self-review` reviewers (85k + 73k) — ≈ 430k tokens, and three of the four independently re-ran or re-derived suite results the parent had already produced (server full suite ≥ 6 times: wave 1, wave 2, T10, T12, parent re-run, verifier). The classifyIndex/classifyTourIndex duplication was disclosed by T10 in its report ("duplicates ~10 lines… sync risk is yours to weigh") and then re-found as MEDIUM #1 by the architecture-reviewer.
**Missed / caught late:** The HIGH `SectionCard` bug (inline `display: flex` overrides `hidden`, so a collapsed card stays visible) passed T9's acceptance, T11's checkpoint, the architecture-reviewer, and a plan-verifier PASS on AC-3 — its test asserted `toBeVisible()`, which jest-dom answers from the `hidden` attribute and not from real CSS (`TourSections.test.tsx:62-71`). It was caught only by the `pr-self-review` ui reviewer. Likewise `summary_md` capped with `Number.MAX_SAFE_INTEGER` (`onboarding/helpers.ts:109`) passed AC-32 (which bounds the prompt, not the output) and was found only by the `pr-self-review` backend reviewer. The planner's TD-1 handling was stale (Project Context had already fixed it); only the cross-model reviewer noticed.

**Proposals:**
- **Make "PASS" prove the test can fail.** Evidence: AC-3 was PASS on a test blind to the bug (row 19 vs row 21). Next run, add to the `plan-verifier` prompt: for each AC marked PASS from a UI test, state which assertion would fail if the behaviour broke and flag assertions that only read attributes jsdom treats specially (`hidden`, `disabled`, `aria-*`); expect the verifier to surface this class before `pr-self-review`.
- **Run all reviewers in one parallel message.** Evidence: Phase B (rows 17, 19) finished before the `pr-self-review` reviewers (rows 20–21) were even started; the latter found the only HIGH. Next run, launch architecture-reviewer, plan-verifier and the ui/backend/security `pr-self-review` reviewers in a single message and measure wall time and findings overlap.
- **Share one diff read.** Evidence: ≈ 430k tokens spent by four agents on the same diff. Next run, give `pr-self-review` reviewers the architecture-reviewer's findings list with "skip placement/layering, look for runtime bugs, unbounded inputs, a11y" so their reading is not a rehash.
- **Write review amendments into the cards, not beside them.** Evidence: T3's Question (card said `commits === 1`, F5 said 0). Next run, after a cross-model review, regenerate or edit the affected `Fixed decisions` lines (via `SendMessage` to the planner) instead of appending an "amendments" section; expect zero card-vs-amendment Questions.
- **Tell implementers not to leave background processes.** Evidence: T6 took 2,048,986 ms against 30–310 s for its peers and its notification said "stopped with background work of its own still running". Next run, add to every implementer prompt: "run tests in the foreground and finish with none left running"; compare durations.
- **Parent runs suites once per wave; verifier trusts it.** Evidence: server full suite ≥ 6 runs and the verifier's Testcontainers timeouts. Next run, pass the verifier "parent ran full suites at <sha>: server 517/517, client 344/344 — re-run only typecheck and targeted tests for rows you cannot confirm".
- **Put an output-bound line on the security checklist for LLM features.** Evidence: `Number.MAX_SAFE_INTEGER` at `helpers.ts:109` survived planning, implementation and two reviewers. Next run, add to the planner's task-card template for any task that persists model output: "every model-derived string has a character cap and the call has `maxTokens`", with a test.

### PR Brief (`specs/2026-10-02-pr-brief.plan.md`, `/run-plan` + follow-ups) — 2026-10-04

Mode: default · Agents: 19 spawns (13 plan run, 2 fix round, 1 user-requested rework, 3 `pr-self-review` reviewers) · Total tokens: ~1.93M (T8's first attempt reported no usage) · Sum of agent durations: ~36 min (wall clock not measured; waves overlapped and one rate-limit pause is in the middle) · Fix-loop rounds: 1

| # | Agent | Model | Tokens | Tool uses | Duration | Status |
|---|---|---|---|---|---|---|
| 1 | implementer T1 contracts | sonnet | 96.9k | 11 | 1m08s | done |
| 2 | implementer T2 classifier move | sonnet | 87.1k | 7 | 0m48s | done |
| 3 | implementer T3 intent seams | sonnet | 125.0k | 17 | 2m49s | done |
| 4 | implementer T4 diff deep link | sonnet | 112.5k | 14 | 2m41s | done |
| 5 | implementer T5 prompt core | sonnet | 149.7k | 20 | 4m56s | done |
| 6 | implementer T6 seed | sonnet | 104.4k | 9 | 0m58s | done |
| 7 | implementer T7 PrBriefCard | sonnet | 151.0k | 23 | 4m35s | done |
| 8 | implementer T8 (first attempt) | sonnet | n/a | n/a | n/a | failed (HTTP 429 session limit, died at "Write the repository") |
| 9 | implementer T9 overview wiring | sonnet | 103.4k | 10 | 1m28s | done |
| 10 | implementer T8 (finish) | sonnet | 149.4k | 24 | 3m23s | done |
| 11 | implementer T10 e2e flow | sonnet | 100.9k | 9 | 0m33s | done |
| 12 | architecture-reviewer | sonnet | 93.0k | 18 | 2m56s | done, 0 findings |
| 13 | plan-verifier | sonnet | 90.9k | 15 | ~3m54s | done, PASS 41 / PARTIAL 3 / UNVERIFIED 7 |
| 14 | implementer fix AC-22 tests | sonnet | 93.0k | 8 | 0m59s | partial (found the production bug, did not fix it) |
| 15 | implementer fix AC-22 slots | sonnet | 96.3k | 10 | 0m59s | done |
| 16 | implementer Risk areas into Intent card (user request) | sonnet | 110.6k | 9 | 1m15s | done |
| 17 | review ui (`pr-self-review`) | sonnet | 102.5k | 11 | 1m02s | done, 1 HIGH + 4 MEDIUM |
| 18 | review backend | sonnet | 84.7k | 12 | 0m58s | done, 1 MEDIUM + 2 LOW |
| 19 | review security | sonnet | 82.0k | 15 | 0m56s | done, 0 findings |

**Went easily:** T1, T2, T4, T6, T9 and T10 were `Status: done` first pass with no fix round touching their files. The architecture review found nothing (`brief/routes.ts:111` reaches blast only through `container.prBlast(app.log)`; both `contracts/brief.ts` copies identical). The T5 caps invariant (system message 507 of 1,000 tokens) held without touching the spec's caps.

**Had difficulty:** (1) T8 was the biggest task (repository, service, routes, registration, two test files) and its first agent was killed by a 429 session limit at "Write the repository"; the replacement had to re-read three unreviewed files (149k tokens). (2) The first flow 14 failed on `wait --text Review focus` because the section title is `text-transform: uppercase` and `innerText` comes back uppercase. That quirk is already at `e2e/INSIGHTS.md:25`; T10's report lists other INSIGHTS lines but not this one. (3) e2e was flaky across six runs: steps `wait --url /pulls` failed in flows 10–13 in two runs and flow 09 failed twice with `skills_workspace_name_uq`, none in code this change touched. (4) The user hit a 65 s timeout on a real generation; a later live run took 56,945 ms against the 60 s limit.

**Duplicated:** The server suite was run at least 7 times (parent baselines ×3, T3/T5/T8 checkpoints, the plan-verifier's own run including the 110 `.it` tests) and the client suite at least 8 times. The architecture-reviewer and the plan-verifier both re-checked that the two vendor copies are identical and ran the onion greps that `gates.sh` runs again in `pr-self-review`. The `pr-self-review` reviewers re-read the same added lines the architecture-reviewer had just cleared.

**Missed / caught late:** The `plan-verifier` rated AC-22 PARTIAL as a test gap, but the real defect was in production code: `PrBriefCard` dropped the Intent and Blast slots in the loading and error states (found by fix agent #14, fixed by #15). The `pr-self-review` ui reviewer found a HIGH no earlier agent saw: `FileCard` compared the deep-link target by object identity, so any parent re-render re-opened a card the user had collapsed (fixed, regression test added). Three layout overflows (a `nowrap` Badge in IntentBody, long paths in SymbolList caller and symbol rows, long paths in risk cards) passed every automated check because jsdom has no layout; the user found them from screenshots. The duplicated "Risk areas" (Intent's own chips plus the brief's risks) was also noticed by the user, not by any agent. Two `gates.sh` HIGHs were false positives (R6 fires on any `db/seed` change; R7 fires on `new XRepository(container.db)` in routes, a pattern already in blast, onboarding and project-context).

**Proposals:**
- **Add a real-browser overflow check to Validation.** Evidence: three overflow bugs reached the user after typecheck, 387 client tests, 14/14 e2e and two reviewers were green. Next run, give the e2e task one `wait --fn` that fails when any descendant of the brief card has `scrollWidth > clientWidth`, run at 1280 and 1400 px on the seeded PR.
- **Record one real LLM call with timing in the plan's acceptance.** Evidence: duration 56,945 ms vs the 60,000 ms limit, plus an earlier 65,000 ms timeout on the same model. Next run, T11 must record one live generation and fail if `duration_ms` exceeds 70% of the timeout, so a tight NFR is caught before the user finds it.
- **Split tasks that touch more than ~4 files plus tests.** Evidence: T8 (149k tokens even as a finish, 24 tool uses) died with nothing reviewable on disk. Next run, split T8 into repository + service + hermetic test, then routes + registration + `.it` test, so an interrupted agent leaves a complete unit.
- **Paste the matching INSIGHTS lines into each task prompt, not just a path.** Evidence: the uppercase `innerText` quirk at `e2e/INSIGHTS.md:25` was missed by T10; T9 and two fix agents reported not reading `client/INSIGHTS.md` in full. Next run, `run-plan` greps each task's package INSIGHTS for the card's keywords and appends the hits.
- **Make the plan-verifier trust the parent's last green run.** Evidence: the verifier re-ran 458 + 110 + 380 tests the parent had just run; the previous retro (same ledger, onboarding tour) already proposed this and it was not adopted. Next run, pass "parent ran full suites at <sha>, output saved at <file>" and let the verifier re-run only a named subset.
- **Classify a fix agent's "the code cannot satisfy the AC" as a production fix at once.** Evidence: round 1 spent agent #14 on tests and agent #15 on the code. Next run, tell fix agents they may change production code when the AC requires it, so one agent closes both.
- **Tighten two `gates.sh` rules.** Evidence: `gate-findings.tsv` listed R6 and R7 on this change and both were false positives. Next run, make R6 fire only when added seed lines touch `system_prompt`, and let R7 allow `new <Name>Repository(container.db` inside `routes.ts` (blast, onboarding, project-context do the same).
