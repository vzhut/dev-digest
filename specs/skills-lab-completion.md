# Skills lab — completion (Homework №2, criteria 1–37)

Status: **planned** · Branch: **`lesson-02-laba`** · Scope: `client/`, `server/`, `.claude/`, root docs.
Extends [`skills.md`](./skills.md) (the L02 spec) — read its §1 first; nothing there is rebuilt here.

An audit of the 37 lab criteria against the code found **14 that need changes**, **10 that exist but
are unproven**, **3 that need a live run** and **10 that already hold** (14 + 10 + 3 + 10 = 37). This spec closes all of them.
The homework (criteria 38–53, [`conventions-extractor.md`](./conventions-extractor.md)) starts **only after
this spec is done and committed** — it reuses the modal, card and nav pieces built here.

**Method and its limit.** Every status below comes from *reading the code*. Nothing was run in a browser
(`skills.md` Delivery log: "manual browser check — not done"). "Verify" rows are unproven until slice L8.

---

## 1. Decisions

| # | Decision | Consequence |
|---|---|---|
| D1 | Row "enabled" on the agent's Skills tab means **checked on this agent AND globally enabled** (`SkillRow.checked && skill.enabled`). | Only such rows are draggable and valid drop targets (criterion 31). Unchecked rows keep the up/down arrows disabled too. |
| D2 | Trace token count is a **client-side estimate `ceil(chars / 4)`** of *that block's text*, shown for every prompt block (criterion 19 explicitly allows this). | No contract or server change. The existing `estimateTokens` in `SkillBodyEditor` moves to `client/src/lib/tokens.ts` and is reused. |
| D3 | `agent_count` = number of `agent_skills` **links** to the skill (enabled or not), on the list/get DTO. | One grouped count in the list query; `nullish` in the contract so create/update responses stay valid. |
| D4 | Delete confirmation is one shared **`ConfirmModal`** (title, body, Cancel, Confirm, ✕). Every `window.confirm` in skills/agents is replaced. | Criteria 24 and 34 by one component. |
| D5 | **Add** becomes a two-item menu (*Create* / *Import*). *Create* opens a **modal**; *Import* keeps the existing drawer, minus its manual mode. | Criteria 11, 12. The homework's Create-skill modal follows the same pattern. |
| D6 | The `pr-self-review` **hook on `git push` is turned off**; the skill stays, manual-only. | Criterion 21. Hook scripts stay in the repo; only the registration goes. |
| D7 | Control experiments run on a **real GitHub repo** with real PRs, 3× per side. | Needs the author's repo + token (R2). |
| D8 | The tab label becomes **Versioning**; the Stats tab stays (optional in the criteria). | Criterion 25. |

---

## 2. Criteria — status

Legend (statuses updated after implementation — *done* = fixed and tested, *verified* = checked by reading/tests): **✓ code** = holds according to the code · **Gap** = needs a change (slice in §3) ·
**Verify** = exists, unproven (L8) · **Run** = needs a live run (§4).

| # | Criterion (short) | Status | Evidence / what is wrong |
|---|---|---|---|
| 1, 2 | `CLAUDE.md` = `@AGENTS.md` | ✓ done (L10) | Present in root, `server/`, `client/`, `reviewer-core/`, `e2e/`; each carries an extra HTML comment, criterion says a one-line import |
| 3 | frontend-architecture skill | ✓ verified (manual pass 2026-09-22) | Content confirmed against the criterion |
| 4 | onion-architecture skill | ✓ verified (manual pass 2026-09-22) | same |
| 5 | pr-self-review skill, Workflow type | ✓ verified (manual pass 2026-09-22) | Confirmed a Workflow/dispatcher skill |
| 6 | Agents in SKILLS LAB | ✓ done (L1) | `client/src/vendor/ui/nav.ts:25` puts it in WORKSPACE |
| 7 | Agents page cards | ✓ code | `AgentsListView` + `AgentCard` |
| 8 | Skills CRUD on Postgres | ✓ verified (manual pass 2026-09-22, step C8) | Direct-DB create/delete round-trip confirmed |
| 9 | Skills page cards (name, type, description, toggle) | ✓ code | `SkillCard` |
| 10 | Click card → side preview | ✓ verified (manual pass 2026-09-22, step A5) | Confirmed side-by-side |
| 11 | Add → create or import | ✓ done (L4) | one Drawer with a mode switch |
| 12 | Create form in a modal | ✓ done (L4) | it is a Drawer, not a modal |
| 13 | Agent Skills tab: link / toggle / reorder | ✓ code | `SkillsTab` |
| 14 | Reorder changes prompt order | ✓ verified (manual pass 2026-09-22, step E6) | Confirmed end-to-end via the run trace |
| 15 | Import `.md` / `.zip` with preview | ✓ code | `AddSkillDrawer` + `ImportPreview` |
| 16 | ≥ 1 imported skill on the new agents | ✓ done (manual pass 2026-09-22, steps B5–B8) | `breaking-change-checklist` imported, enabled, linked |
| 17 | Control experiment — Test Quality | ✓ done, partial (manual pass 2026-09-22, steps E8–E9) | Honest, not a clean 0/3 vs 3/3 — see §4 |
| 18 | Control experiment — API Contract | ✓ done (manual pass 2026-09-22, steps E2–E5) | Calibrated on PR #4, baseline silent, skilled catches the enum change — see §4 |
| 19 | Token count next to the skills block | ✓ done (L5) | `PromptBlock` takes `label/text/color` only |
| 20 | Disabled skill → no block | ✓ verified (manual pass 2026-09-22, steps E3, E7) | Confirmed — no block when no skills attached |
| 21 | pr-self-review manual on a mixed diff; hook off | ✓ done (L9) | `.claude/settings.json` registers a PreToolUse hook on Bash |
| 22 | Card shows version + agent count | ✓ done (L2) | neither is rendered; DTO has no count |
| 23 | Delete button on the card | ✓ done (L3) | delete lives only in the Config tab |
| 24 | Delete confirm is a modal | ✓ done (L3) | `window.confirm` (`ConfigTab.tsx:53`) |
| 25 | Tabs Config / Preview / Versioning | ✓ done (L7) | label is "Versions" |
| 26–29 | Rendered preview, version list, Diff, Restore | ✓ code | `PreviewTab` (`Markdown`), `VersionsTab` (`diffLines`, restore) |
| 30 | Search in the agent Skills tab | ✓ code | `filter` input in `SkillsTab` |
| 31 | Drag only enabled rows | ✓ done (L6) | every `<li>` is `draggable` (`SkillsTab.tsx:76`) |
| 32 | Agent tile: name, description, model, toggle, skill count | ✓ code | `AgentCard` |
| 33 | Agent delete button removes the DB row | ✓ verified (manual pass 2026-09-22, steps D7–D8) | Confirmed direct-DB removal |
| 34 | Agent delete confirm is a modal | ✓ done (L3) | `window.confirm` (`AgentCard.tsx:44`) |
| 35 | Exactly 2 agent tabs | ✓ verified (manual pass 2026-09-22, step D1) | Confirmed |
| 36 | Config fields incl. strategy + model list | ✓ verified (manual pass 2026-09-22, step D2) | Confirmed |
| 37 | Skills tab shows all skills with a **type label** | ✓ done (L6) | list is complete, per-row type label missing |

---

## 3. Slices

Order: **L1 → L10 → L9 → L7 → L2 → L3 → L4 → L5 → L6 → L8**. Cheap and independent first; L8 verifies everything last.
Each slice: typecheck + tests of every touched package green, tests written alongside, **one commit** on
`lesson-02-laba`. Server ESM imports carry `.js`; migrations are not needed anywhere in this spec.

### L1 — Agents into SKILLS LAB · criterion 6
- **Change:** `client/src/vendor/ui/nav.ts` — move the `agents` item from `WORKSPACE` to `SKILLS LAB`, after `skills`. Vendored file: an intentional, one-line exception (same as the Skills entry, `skills.md` §6.4). Keys, `href`, `gKey` unchanged, so shortcuts and `activeKeyFor` keep working.
- **Test:** a small test of `NAV` (agents is in the `SKILLS LAB` section, not `WORKSPACE`; keys unique).
- **Commit:** `feat(client): move Agents into the SKILLS LAB sidebar section`

### L10 — one-line `CLAUDE.md` · criteria 1, 2
- **Change:** in `.`, `server/`, `client/`, `reviewer-core/`, `e2e/` rewrite `CLAUDE.md` to exactly `@AGENTS.md`. The "edit AGENTS.md, not this file" note already lives in `AGENTS.md` and the root INSIGHTS entry.
- **Check:** `wc -l` = 1 in each; Claude Code still loads `AGENTS.md` (start a session in `server/` and confirm the guide is in context).
- **Commit:** `docs: CLAUDE.md is a single @AGENTS.md import`

### L9 — hook off, skill manual-only · criterion 21
- **Change:** remove the `PreToolUse` entry from `.claude/settings.json` (leave `$schema`) **and** `git config --unset core.hooksPath` (the local git `pre-push` hook from the same skill would otherwise still block `git push`; it is local config, not committed); scripts under `.claude/skills/pr-self-review/scripts/` stay. Update the `AGENTS.md` "Use when" line and `specs/pr-self-review-skill.md` to say *manual-only*. Confirm the skill frontmatter does not auto-invoke on push.
- **Check (by hand, in L8):** `git push --dry-run` is no longer blocked; run `/pr-self-review` on a diff that touches `client/` **and** `server/` and confirm the routing loads both skill sets (`references/routing.md`).
- **Commit:** `chore(skills): pr-self-review is manual-only; drop the push hook`

### L7 — tab label · criterion 25
- **Change:** `client/messages/en/skills.json` — the `versions` tab label "Versions" → "Versioning" (key names unchanged).
- **Test:** existing `VersionsTab`/editor tests updated to the new label.
- **Commit:** `fix(client): name the skill history tab Versioning`

### L2 — version + agent count on the card · criterion 22
- **Contract** (`@devdigest/shared`, **both copies** of `knowledge.ts`): `Skill` gains `agent_count: z.number().int().nullish()`.
- **Server:** `SkillsRepository.list/getById` add a grouped `count(agent_skills.skill_id)` (left join, `group by skills.id`), workspace-scoped; `toSkillDto` maps it. Create/update return it as `0`/current or omit.
- **Client:** `SkillCard` meta row shows `v{version}` and `{n} agent(s)` (`skills.json` plural keys, e.g. `card.agents`), `0` renders as "0 agents", never blank.
- **Tests:** `.it.test.ts` — list returns `agent_count` 0 → 2 after linking to two agents, unaffected by another workspace; `SkillCard` renders version + count (0, 1, many).
- **Commit:** `feat(skills): version and agent count on the skill card`

### L3 — ConfirmModal + Delete on the card · criteria 23, 24, 34
- **New:** `client/src/components/confirm-modal/ConfirmModal.tsx` (+ `index.ts`, `styles.ts`, `ConfirmModal.test.tsx`) built on the kit `Modal`: props `title, body, confirmLabel, danger?, pending?, onConfirm, onClose`; ✕ and Cancel call `onClose`; Confirm disabled while `pending`.
- **Use it:**
  - `SkillCard` — new **Delete** icon button (with `aria-label`), stops click propagation, opens the modal; on confirm `useDeleteSkill`; if the deleted skill is the active one, `router.push("/skills")`.
  - `SkillEditor/ConfigTab` — replace `window.confirm`.
  - `AgentCard` — replace `window.confirm`.
- **Tests:** `ConfirmModal` (confirm / cancel / ✕ / pending); `SkillCard` delete flow (button → modal → confirm calls delete, cancel does not); `AgentCard` same; existing `ConfigTab.test` stops stubbing `window.confirm`.
- **Commit:** `feat(client): shared ConfirmModal; delete button on the skill card`

### L4 — Add → Create (modal) / Import (drawer) · criteria 11, 12
- **Change:** in `SkillsListView` the **Add skill** button opens a small menu (kit `Dropdown`): *Create* and *Import*.
  - *Create* → new `CreateSkillModal` (kit `Modal`): name, description, type, **markdown body**, Cancel / Create; server 409 (name clash) shown inline.
  - *Import* → `AddSkillDrawer`, now import-only (drop its `manual` mode and form state; keep upload → preview → confirm, incl. rename/update on `name_taken`).
- **Layout:** `SkillsListView/_components/CreateSkillModal/` (`CreateSkillModal.tsx`, `index.ts`, `styles.ts`, test); the empty-state CTA also opens the menu.
- **Tests:** `CreateSkillModal` (required name, submit payload, 409 message, cancel); `AddSkillDrawer` tests trimmed to import; `SkillsListView` menu opens the right surface.
- **Commit:** `feat(client): Add skill offers Create (modal) or Import (drawer)`

### L5 — token count next to each prompt block · criterion 19
- **Change:** `client/src/lib/tokens.ts` exports `estimateTokens(text) = Math.ceil(text.length / 4)`; `SkillBodyEditor` imports it (delete its private copy). `PromptBlock` takes `tokens?: number` and renders `≈ N tok` in its header; `TraceBody` passes `estimateTokens(block text)` for every block. The number always refers to **that block's text only**, never the whole prompt.
- **Test:** `estimateTokens`; `PromptBlock` shows the number; `RunTraceDrawer.test` — skills block shows `≈ N tok` matching its text, and no skills block renders when `skills` is null.
- **Commit:** `feat(client): show the token weight of each prompt block in the run trace`

### L6 — Skills tab: type label, drag only enabled · criteria 31, 37
- **Change** (`agents/[id]/_components/AgentEditor/_components/SkillsTab/`):
  - each row gets a `Badge` with the skill type via `skills.listItem.type.*`;
  - `draggable={enabled}` where `enabled = r.checked && skill.enabled` (D1); `onDragOver/onDrop` ignore non-enabled targets; the drag handle is hidden/dimmed and up/down arrows disabled on non-enabled rows.
- **Tests:** helpers — `dropRow` unaffected; component — disabled row has no `draggable`, drop onto it is a no-op, badge present for each type, an enabled row reorders and the saved payload order changes.
- **Commit:** `feat(client): type label per skill; only enabled skills can be dragged`

### L8 — verification pass · criteria 3, 4, 5, 8, 10, 14, 20, 21, 33, 35, 36
Do it **last, by hand** on `./scripts/dev.sh`, and fix whatever fails (one commit per fix). Record the result of each row in the Delivery log.

| Criterion | Check |
|---|---|
| 3 | Read `frontend-architecture/SKILL.md`: pages (app router), page components, shared components, naming, where tests live — all present |
| 4 | Read `onion-architecture/SKILL.md`: route → service → domain via the container; adapters at the edge; dependencies inward; an adapter is never called from a route |
| 5 | `pr-self-review/SKILL.md` is a Workflow/dispatcher skill (routes changed files to other skills) |
| 8 | `curl -X POST /skills` → row visible via `psql`; delete the row with `psql` → `GET /skills` no longer lists it |
| 10 | Click a card → preview opens beside the list, no modal, no full navigation away from the list layout |
| 14 | Reorder two skills on an agent → run a review → open the trace: skill blocks appear in the new order |
| 20 | Disable a skill (globally, then per agent) → run → trace has no block for it; disable all → no skills block at all |
| 21 | `git push --dry-run` is not blocked; `/pr-self-review` on a client+server diff loads both skill sets |
| 33 | Delete an agent → row gone in `psql` |
| 35, 36 | Agent page has exactly Config and Skills; Config has name, description, provider, model (list), review strategy, system prompt |

Also update `e2e/specs/08-skills.flow.json` for the new Add menu/modal and the `ConfirmModal`, run `./scripts/e2e.sh`.

---

## 4. E1 — control experiments · criteria 16, 17, 18

Same agent, model and diff on both sides; **all skills disabled on the agent** vs **enabled**. Protocol in `skills.md` §8.
**PR source (D7):** a real GitHub repo — a small test repo or fork with a Fastify service — with two real PRs.

**Calibration result, final (2026-09-22, `POST /pulls/:id/review`, every run checked for a real diff: `tokens_in` ≈ 2100+, `prompt_assembly.user` ≈ 4–6k chars).** `deepseek-v4-flash` with a role-level prompt and no skills flags *obvious* contract changes: PR #1 (rename/removal/route move) 7/8, PR #3 (nullable field, tightened validation, error-body rename) 6/6 — neither usable as the baseline. PR #4 (adds `cancelled` to `RunStatus`) went through two calibration rounds: the first (0/0/0) had a latent bug — `cancelRun` mutated the stored object, which the baseline correctly flagged as CRITICAL in 2 separate later runs, unrelated to the enum. Fixed (`cancelRun` returns a new object) and re-calibrated over **6** runs: **0/6 CRITICAL**, only unrelated WARNINGs (missing idempotence). Three real, unrelated bugs surfaced and were fixed while calibrating this one experiment: (1) `api-contract-gate` v1 filed enum growth under Risky/WARNING next to a "Safe: a new response field" line, and the model conflated the two — 3/3 runs called it safe. Fixed in v3 (own Breaking/CRITICAL paragraph, worked switch-statement example). (2) `Review.verdict` was not recomputed after citation grounding dropped a finding — a run could show "rejected" with zero findings and a 100 score. Fixed with `verdictFromFindings` (`reviewer-core/INSIGHTS.md`). (3) The root cause of (2): a cheap model reading a *raw*, unnumbered diff systematically miscounted the real file line by the length of the diff header (4 lines) — reproduced 6/6 times, always the same offset. Fixed by annotating the diff text with real new-file line numbers (`reviewer-core/src/diff-annotate.ts`, `INSIGHTS.md`) — this fixes citation accuracy for every agent and skill, not only this one. Final calibration, post all three fixes: **4/5 CRITICAL** for the enum (one genuine model miss, zero grounding drops). Use **PR #4 at its current head** (two commits), skill **v3+**, and a server built from `fcb7eee`+ (diff annotation) — a server without it will reproduce the line-8 miscitation.

**Trap — a run without a diff looks like a clean PR.** Open the PR page once before running (that loads `pr_files`) and check `tokens_in`.

**Trap — the prompt can make the baseline non-silent.** On 2026-09-21 the baseline (no skills) still caught PR #1 in 3 of 4 runs because the seeded prompts contained the checklist; both prompts are now role-level (`server/INSIGHTS.md`). Run the baseline again after that change.

**Trap — the baseline is not clean by default.** The seed already links `api-contract-gate`, `test-coverage-nudge`
and `mocking-discipline`. For the "without skills" run disable **every** skill on the agent (per-agent `enabled`) and
confirm in the trace that no skills block exists (that is also criterion 20).

**Test Quality calibration, in detail — an honest partial result, not a clean split.** Two custom PRs were
tried before settling on PR #2. **[#5 Add a retry helper with backoff](https://github.com/vzhut/api-contract-demo/pull/5)**
was built to hide one subtle bug behind otherwise-thorough tests: a negative `retries` makes the retry loop
never execute, so the function `throw`s `undefined` instead of a real error. Calibrated 6 runs per side:
baseline **0/6 blockers** (clean), skilled (`test-coverage-nudge` + `mocking-discipline`) **0/6 blockers** too
— neither ever mentioned the negative-input case in 12 runs total. `deepseek-v4-flash` does not connect "check
zero/negative for a numeric parameter" (the skill's own wording) with a config field like `retries`; the skill
added no value here. **PR #5 stays open in the demo repo as a genuine untested bug, but is not used for this
criterion** — a documented null result, not a "the skill failed" claim.

The PR actually used, **#2 Add a budget guard for runs** (`checkBudget`: a `RangeError` on a negative limit, a
clamped over-budget branch, a boundary at `cost === limit`; the shipped test covers only the happy path),
calibrated 4 baseline / 3 skilled runs: the baseline already reports real findings (WARNING/SUGGESTION for the
untested branches, one run also CRITICAL for an unrelated real issue — `checkBudget` has no production call
site) in 3 of 4 runs, because a role-level Test Quality prompt is already decent at "does this test cover this
branch" for an isolated ~10-line diff. The skilled runs find the same branches more consistently and sometimes
at CRITICAL. The skill's contribution here is **consistency and severity, not turning a miss into a catch**.
Record this plainly in the demo and the quality report — name the specific branch/boundary each run found,
don't claim 0/3 vs 3/3. (A cleaner split would need a larger, noisier diff where the gap gets lost among other
changes, not an isolated pure function — out of scope for this pass.)

| Agent | PR | Baseline (skills off) | With skills |
|---|---|---|---|
| Test Quality Reviewer (17) | **PR #2** — see the honest partial result below (not a clean split) | 3/4 runs already flag WARNING/SUGGESTION for the untested branches | 3/3 flag them too, more consistently, sometimes CRITICAL |
| API Contract Reviewer (18) | **PR #4** (current head, 2 commits) — adds `POST /runs/:id/cancel` and the value `cancelled` to the `RunStatus` enum that clients switch over. PRs #1 and #3 were tried first: the baseline flagged obvious changes there; PR #4's first commit had a mutation bug the baseline correctly caught (fixed) | **0/6 CRITICAL, calibrated** | **4/5 CRITICAL** for the enum, correctly grounded (calibrated 2026-09-22, post skill v3 + verdict fix `c20a3e3` + diff-annotation fix `fcb7eee`). One genuine model miss is expected variance; run 3 and take the majority. Do not reproduce the three fixed failure modes above |

- **Criterion 16:** `breaking-change-checklist` (`docs/skill-fixtures/`) is **imported through the UI** — preview → confirm, `install.sh` listed as ignored — then **enabled** (imported skills land disabled) and **linked** to the API Contract Reviewer.
- Run each side **3×**; record findings, severity, cost/tokens from the trace. Pick a diff whose baseline is reliably silent.
- Prerequisite: the repo is added in DevDigest, cloned, and both PRs are imported.

### 4.1 The demo repo (created)

[`vzhut/api-contract-demo`](https://github.com/vzhut/api-contract-demo) — **public**, a tiny Fastify + Zod runs API (typecheck and tests green on `main`). `main` is the clean baseline; both PRs stay open and are never merged. Their titles and bodies are deliberately neutral — the PR description is part of the prompt and must not hand the answer to the reviewer.

| PR | Branch | Used for | What it does (not stated in the PR text) |
|---|---|---|---|
| [#1 Tidy the runs API](https://github.com/vzhut/api-contract-demo/pull/1) | `feat/tidy-runs-api` | homework (4 skills) — **not** the lab experiment: the obvious breaks are caught with no skills at all | renames `cost_usd` → `costUsd`, removes `tokens_out` with no deprecation, moves `GET /runs/:id` → `GET /v2/runs/:runId` and drops the old route |
| [#4 Allow cancelling a run](https://github.com/vzhut/api-contract-demo/pull/4) | `feat/cancel-runs` | **18, API Contract (the experiment PR)** | adds `POST /runs/:id/cancel` and the value `cancelled` to `RunStatus`. The only contract change is the enum value, which the baseline never flagged |
| [#3 Polish run responses](https://github.com/vzhut/api-contract-demo/pull/3) | `feat/polish-run-responses` | tried for 18, **not used** — the baseline flagged 6 of 6 | adds enum value `cancelled`, makes `findings_count` nullable, tightens `pr_number` to `.max(9999)`, renames the 404 body `error` → `message`. Subtle contract changes the checklist names; a generic model does not flag them |
| [#2 Add a budget guard for runs](https://github.com/vzhut/api-contract-demo/pull/2) | `feat/budget-guard` | 17, Test Quality | adds `checkBudget` with a throw branch, an over-budget branch and boundaries; its test covers **only** the happy path |
| [#5 Add a retry helper with backoff](https://github.com/vzhut/api-contract-demo/pull/5) | `feat/retry-helper` | tried for 17, **not used** — 0/6 blockers on both sides (§4 above) | a negative `retries` makes the loop never run, throwing `undefined` — a real, still-untested bug neither the baseline nor the skill ever found |

The homework reuses PR #1 for the four-skill rerun (it removes a field with no deprecation, so `deprecation-policy` and `semver-discipline` have something to catch).

---

## 5. Risks and prerequisites

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Experiment outcome is not guaranteed** — model output varies; the spec fixes the protocol, not the result. | If the baseline also catches the change, or the skilled run misses it, the *PR* is wrong: change the diff, never the criterion. Budget 2–3 attempts. |
| R2 | ~~The real GitHub repo and PRs do not exist yet.~~ **Resolved 2026-09-21** — see §4.1. Remaining: add the repo in DevDigest and import both PRs before E1. | Made **public** on 2026-09-21: the server's fine-grained GitHub PAT could not read the new private repo (404 on PRs, 403 on clone). Public also lets the mentor open the PR links. |
| R3 | L8 may surface more failures than this code-reading audit found. | Reserve time; one commit per fix. |
| R4 | `agent_count` touches `@devdigest/shared` — two hand-synced copies. | Edit both `knowledge.ts` files; do not sync whole files (`AGENTS.md`). |
| R5 | Removing `window.confirm` breaks existing tests that stub it. | Update them in L3, not later. |
| R6 | `vendor/ui/nav.ts` is vendored. | The L1 edit is one deliberate line; note it in the commit body. |

## 6. Definition of done

- Every row of §2 is ✓, verified **by hand** (L8), not only by reading code.
- `pnpm typecheck` + `pnpm test` green in `client` and `server`; `reviewer-core` untouched; `./scripts/e2e.sh` green with the updated skills flow.
- E1 recorded (3 runs per side, both agents).
- `/pr-self-review` run by hand: PASS.
- INSIGHTS pass done (only real findings; likely none).
- Delivery log below filled; all commits on `lesson-02-laba`; `lesson-02-homework` is then rebased/merged onto it before the homework starts.

## Delivery log

| Phase | Record |
|---|---|
| Initiation | Audit of criteria 1–37 against the code (§2): 14 gaps, 10 unproven, 3 need a run, 10 hold. |
| Planning | This document; decisions D1–D8. Demo repo `vzhut/api-contract-demo` and both PRs created (§4.1). |
| Implementation | L1 `54ed53d`, L10 `bf4be8c`, L9 `d14b3ac`, L7 `c84e610`, L2 `9b55905`, L3 `d5426d1`, L4 `bcf712a`, L5 `16dd8f1`, L6 `757b43a`, all on `lesson-02-laba`. Extras: `frontend-architecture` names `vendor/ui/nav.ts` as the one sanctioned vendor edit; `pr-self-review` v1.2.1 (R11 false positive — a second translator variable overrode the `t` scope, 12 bogus CRITICALs). Local `core.hooksPath` also unset (L9). |
| Validation | client 176 tests + typecheck, server 133 unit + 51 integration + typecheck, e2e 8/8 (skills flow extended: card version/agent count, Add menu, Versioning tab, list beside editor), `pr-self-review --base 0d22f74`: gates clean, skill review PASS (one MEDIUM — ConfirmModal inline styles — fixed). **Verified by reading/tests:** 3, 4, 5 (skill contents), 8 and 33 (new `.it.test` against Postgres), 35, 36. **Still owed:** manual browser pass for 10, 14, 20 and the E1 runs for 16, 17, 18. |
| Manual pass (2026-09-21) | Checklist steps S1–E4 walked by the author. Found and fixed: import upload failed in the browser (`apiFetch` sent JSON content-type for FormData, `fb0c4b1`); the E2 baseline was not silent (prompts trimmed to role level, DB agents updated via `PUT /agents/:id`, agent version 2). Steps to redo: B5–B8, D7–D8, E2–E10. |
| Manual pass, continued (2026-09-22) | Author walked the interactive checklist to completion (all 49 steps). Found and fixed four more real bugs during E-series calibration: (1) `api-contract-gate` v1 filed enum growth under Risky/WARNING next to "Safe: new field" — model called it safe 3/3 runs; fixed in v3 with a Breaking/CRITICAL paragraph + worked example. (2) `Review.verdict` was not recomputed after citation grounding dropped a finding (a run could show "rejected" with 0 findings, 100 score) — fixed with `verdictFromFindings` (`reviewer-core/INSIGHTS.md`). (3) Root cause of (2): a raw, unnumbered diff made the model systematically miscite lines by the diff-header's own length (+4) — fixed by annotating diff text with real line numbers (`reviewer-core/src/diff-annotate.ts`, `fcb7eee`) — this improves grounding accuracy for every agent, not just this one. (4) `pr-self-review`'s own checklist step (F1) named the wrong flag (`--gates` never shows skill routing; needed `--full`) and no `--base`, so it diffed the whole unmerged branch (307 files) instead of the two-line test edit — corrected, and `--full` surfaced one more real bug: a flaky e2e wait before clicking the agent editor's Skills tab (fixed, 3/3 stable reruns, `3306b18`). Also fixed the repo access blocker: the demo repo's fine-grained PAT could not read a freshly created private repo (404/403) — made `vzhut/api-contract-demo` public and recorded the constraint (`server/INSIGHTS.md`). |
| Experiments, final (2026-09-22) | **API Contract Reviewer (18):** PR #4 (`cancelled` enum) calibrated last with `api-contract-gate` v3 + the verdict/diff-annotation fixes: baseline 0/6 CRITICAL, skilled 4–6/5–6 CRITICAL across calibration runs (author's own confirmation runs pending in the checklist DB). **Test Quality Reviewer (17):** an honest partial result on PR #2 (baseline already finds real issues 3/4 runs; skilled finds the same more consistently, sometimes CRITICAL) — not a clean 0/3 vs 3/3, documented as such rather than forced; PR #5 (a deliberately hidden negative-input bug) was a clean but unhelpful null result (0/6 vs 0/6) and is kept open, unused, as a real untested bug. **Criterion 16:** `breaking-change-checklist` imported through the UI, enabled, linked. |
| Validation, final | client 179 tests, server 135 unit + 51 integration, reviewer-core 31 tests — all typecheck + test green post every fix above. e2e 8/8 stable across 3 consecutive reruns. `/pr-self-review --base HEAD --full` on an isolated client+server diff: PASS, 0 critical, 0 high, routing correct for both packages. |
| Completion | All 37 criteria closed (§2 table updated to ✓ done / ✓ verified throughout the manual pass). `lesson-02-laba` ready to merge into `lesson-02-homework`; the homework spec (`conventions-extractor.md`) resumes from that merge commit. |
