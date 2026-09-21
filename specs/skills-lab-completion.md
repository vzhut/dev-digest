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

Legend: **✓ code** = holds according to the code · **Gap** = needs a change (slice in §3) ·
**Verify** = exists, unproven (L8) · **Run** = needs a live run (§4).

| # | Criterion (short) | Status | Evidence / what is wrong |
|---|---|---|---|
| 1, 2 | `CLAUDE.md` = `@AGENTS.md` | **Gap** (L10) | Present in root, `server/`, `client/`, `reviewer-core/`, `e2e/`; each carries an extra HTML comment, criterion says a one-line import |
| 3 | frontend-architecture skill | **Verify** (L8) | Folder exists; content never read against the criterion |
| 4 | onion-architecture skill | **Verify** (L8) | same |
| 5 | pr-self-review skill, Workflow type | **Verify** (L8) | File exists; type not checked |
| 6 | Agents in SKILLS LAB | **Gap** (L1) | `client/src/vendor/ui/nav.ts:25` puts it in WORKSPACE |
| 7 | Agents page cards | ✓ code | `AgentsListView` + `AgentCard` |
| 8 | Skills CRUD on Postgres | **Verify** (L8) | `modules/skills` + `.it.test.ts`; the direct-DB check is manual |
| 9 | Skills page cards (name, type, description, toggle) | ✓ code | `SkillCard` |
| 10 | Click card → side preview | **Verify** (L8) | `/skills/:id` renders list + `detail` pane side by side |
| 11 | Add → create or import | **Gap** (L4) | one Drawer with a mode switch |
| 12 | Create form in a modal | **Gap** (L4) | it is a Drawer, not a modal |
| 13 | Agent Skills tab: link / toggle / reorder | ✓ code | `SkillsTab` |
| 14 | Reorder changes prompt order | **Verify** (L8) | wiring exists (`run-executor.ts:158-221`); never shown end-to-end |
| 15 | Import `.md` / `.zip` with preview | ✓ code | `AddSkillDrawer` + `ImportPreview` |
| 16 | ≥ 1 imported skill on the new agents | **Run** (E1) | fixture deliberately not seeded |
| 17 | Control experiment — Test Quality | **Run** (E1) | not run |
| 18 | Control experiment — API Contract | **Run** (E1) | not run |
| 19 | Token count next to the skills block | **Gap** (L5) | `PromptBlock` takes `label/text/color` only |
| 20 | Disabled skill → no block | **Verify** (L8) | block renders iff `prompt_assembly.skills != null` |
| 21 | pr-self-review manual on a mixed diff; hook off | **Gap** (L9) | `.claude/settings.json` registers a PreToolUse hook on Bash |
| 22 | Card shows version + agent count | **Gap** (L2) | neither is rendered; DTO has no count |
| 23 | Delete button on the card | **Gap** (L3) | delete lives only in the Config tab |
| 24 | Delete confirm is a modal | **Gap** (L3) | `window.confirm` (`ConfigTab.tsx:53`) |
| 25 | Tabs Config / Preview / Versioning | **Gap** (L7) | label is "Versions" |
| 26–29 | Rendered preview, version list, Diff, Restore | ✓ code | `PreviewTab` (`Markdown`), `VersionsTab` (`diffLines`, restore) |
| 30 | Search in the agent Skills tab | ✓ code | `filter` input in `SkillsTab` |
| 31 | Drag only enabled rows | **Gap** (L6) | every `<li>` is `draggable` (`SkillsTab.tsx:76`) |
| 32 | Agent tile: name, description, model, toggle, skill count | ✓ code | `AgentCard` |
| 33 | Agent delete button removes the DB row | **Verify** (L8) | button exists |
| 34 | Agent delete confirm is a modal | **Gap** (L3) | `window.confirm` (`AgentCard.tsx:44`) |
| 35 | Exactly 2 agent tabs | **Verify** (L8) | `TABS` — confirm |
| 36 | Config fields incl. strategy + model list | **Verify** (L8) | imports suggest yes |
| 37 | Skills tab shows all skills with a **type label** | **Gap** (L6) | list is complete, per-row type label missing |

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

**Trap — the baseline is not clean by default.** The seed already links `api-contract-gate`, `test-coverage-nudge`
and `mocking-discipline`. For the "without skills" run disable **every** skill on the agent (per-agent `enabled`) and
confirm in the trace that no skills block exists (that is also criterion 20).

| Agent | PR | Baseline (skills off) | With skills |
|---|---|---|---|
| Test Quality Reviewer (17) | adds a function with a failure branch and a **happy-path-only** test | expected 0/3 flag the uncovered branch | 3/3 flag the branch **and** a boundary case |
| API Contract Reviewer (18) | renames `cost_usd` → `costUsd` **or** changes a route signature (`/runs/:id` → `/runs/:runId`, a method or status code) | expected 0/3 | 3/3 report the breaking change with file:line and before/after |

- **Criterion 16:** `breaking-change-checklist` (`docs/skill-fixtures/`) is **imported through the UI** — preview → confirm, `install.sh` listed as ignored — then **enabled** (imported skills land disabled) and **linked** to the API Contract Reviewer.
- Run each side **3×**; record findings, severity, cost/tokens from the trace. Pick a diff whose baseline is reliably silent.
- Prerequisite: the repo is added in DevDigest, cloned, and both PRs are imported.

### 4.1 The demo repo (created)

[`vzhut/api-contract-demo`](https://github.com/vzhut/api-contract-demo) — **private**, a tiny Fastify + Zod runs API (typecheck and tests green on `main`). `main` is the clean baseline; both PRs stay open and are never merged. Their titles and bodies are deliberately neutral — the PR description is part of the prompt and must not hand the answer to the reviewer.

| PR | Branch | Used for | What it does (not stated in the PR text) |
|---|---|---|---|
| [#1 Tidy the runs API](https://github.com/vzhut/api-contract-demo/pull/1) | `feat/tidy-runs-api` | 18, API Contract | renames `cost_usd` → `costUsd`, removes `tokens_out` with no deprecation, moves `GET /runs/:id` → `GET /v2/runs/:runId` and drops the old route |
| [#2 Add a budget guard for runs](https://github.com/vzhut/api-contract-demo/pull/2) | `feat/budget-guard` | 17, Test Quality | adds `checkBudget` with a throw branch, an over-budget branch and boundaries; its test covers **only** the happy path |

The homework reuses PR #1 for the four-skill rerun (it removes a field with no deprecation, so `deprecation-policy` and `semver-discipline` have something to catch).

---

## 5. Risks and prerequisites

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Experiment outcome is not guaranteed** — model output varies; the spec fixes the protocol, not the result. | If the baseline also catches the change, or the skilled run misses it, the *PR* is wrong: change the diff, never the criterion. Budget 2–3 attempts. |
| R2 | ~~The real GitHub repo and PRs do not exist yet.~~ **Resolved 2026-09-21** — see §4.1. Remaining: add the repo in DevDigest and import both PRs before E1. | The repo is **private**: a mentor cannot open the PR links without access — make it public or invite them before the demo. |
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
| Implementation | — |
| Validation | — |
| Completion | — |
