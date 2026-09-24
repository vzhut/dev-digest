# Skills lab — manual verification checklist

Companion to [`skills-lab-completion.md`](./skills-lab-completion.md). Everything the tests cannot prove is here, in the order to do it.
**How to report:** send the step number and `ok` or `fail` + what you saw (e.g. `C4 fail — modal has no Cancel`). The status column is updated
from your answers; a criterion counts as passed only when **all** its steps are `ok`.

Status: ☐ not done · ✅ ok · ❌ fail

## 0. Start the stack (once)

```sh
git checkout lesson-02-laba
./scripts/dev.sh            # Postgres (docker) → migrate → seed → API :3001 + web :3000
```

No new migration in this work. Open http://localhost:3000. Keep the terminal open — API logs are useful for step E (run logs).
Need a clean slate for the experiments? Use the seeded data as is; nothing below deletes real data except the two throw-away things you create yourself.

## A. Sidebar, cards, Skills page — criteria 6, 7, 9, 10, 22, 23, 24

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| A1 | Look at the left sidebar | Sections **WORKSPACE** (Pull Requests) and **SKILLS LAB** (**Skills**, **Agents**). Agents is *not* under WORKSPACE | 6 | ☐ |
| A2 | Click **Agents** | Grid of agent cards, including Security / Test Quality / API Contract Reviewer | 7 | ☐ |
| A3 | Click **Skills** | Grid of skill cards; each has name, type badge, description, an on/off toggle | 9 | ☐ |
| A4 | On a card look at the bottom row | Shows `v1` (or the skill's version) and `N agent(s)`, e.g. `test-coverage-nudge` → `1 agent` | 22 | ☐ |
| A5 | Click a skill card | The editor opens **to the right of the list**; the list is still visible on the left (no modal, no page swap) | 10 | ☐ |
| A6 | Click the 🗑 icon on a card (not the card itself) | A **modal** asks to confirm, with **Cancel**, **Delete** and a ✕. Card did not open behind it | 23, 24 | ☐ |
| A7 | Press **Cancel**, then open it again and press ✕ | Both close it; the skill is still in the list | 24 | ☐ |

## B. Create / Import — criteria 11, 12, 15, 16

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| B1 | Click **Add Skill** | A small menu: **Create skill** and **Import from file** | 11 | ☐ |
| B2 | Choose **Create skill** | A **modal** with Name, Description, Type, Skill body (Markdown), Cancel, Create skill | 12 | ☐ |
| B3 | Name `manual-check`, description `Apply when testing`, any body → **Create skill** | Modal closes, `manual-check` appears in the list | 12 | ☐ |
| B4 | Create again with the same name | Red error inside the modal ("already exists"); modal stays open | 12 | ☐ |
| B5 | **Add Skill → Import from file**, choose `docs/skill-fixtures/breaking-change-checklist.zip` | Drawer shows a **preview**: included `SKILL.md` + `references/semver-for-apis.md`, ignored `install.sh` ("not imported, not executed"). Nothing saved yet | 15 | ☐ |
| B6 | Press **Cancel** in the preview | Nothing new in the list | 15 | ☐ |
| B7 | Import it again → **Confirm import** | `breaking-change-checklist` appears, source **Imported**, **disabled**, "needs vetting" badge | 15, 16 | ☐ |
| B8 | Open it → Config → turn **Enabled** on → Save | It is now enabled | 16 | ☐ |
| B9 | Also test a plain file: create `note.md` (`# My rule` + a paragraph), import it | Preview shows name `My rule`; confirm works | 15 | ☐ |

## C. Skill page tabs — criteria 8, 25–29

Open any skill (use `manual-check`).

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| C1 | Look at the tab bar | Config · Preview · Stats · **Versioning** | 25 | ☐ |
| C2 | Config: change the body, add a version message, **Save skill** | Toast `Skill saved (v2)` | 27 | ☐ |
| C3 | **Preview** | Rendered Markdown (headings/bold), not raw `#` text | 26 | ☐ |
| C4 | **Versioning** | List of versions, newest first, current marked | 27 | ☐ |
| C5 | Press **Diff** on an older version | Shows what differs from the current body | 28 | ☐ |
| C6 | Press **Restore** on the old version | Body goes back to that text; a **new** version appears (history is not rewritten) | 29 | ☐ |
| C7 | Config → Delete → confirm in the modal | Skill gone from the list, page returns to `/skills` | 24 | ☐ |
| C8 | DB check (create/delete). Create a skill `db-check` in the UI, then run: `docker exec -it devdigest-postgres psql -U devdigest -d devdigest -c "select id,name,version from skills where name='db-check';"` | One row. Then `... -c "delete from skills where name='db-check';"` and **refresh the Skills page** — it is gone | 8 | ☐ |

## D. Agent editor — criteria 13, 30, 31, 32, 33, 34, 35, 36, 37

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| D1 | **Agents** — look at a card | Name, description, model chip, on/off toggle, `N skills`, 🗑 | 32 | ☐ |
| D2 | Open **API Contract Reviewer** | Exactly **two** tabs: **Config**, **Skills** | 35 | ☐ |
| D3 | **Config** tab | Name, Description, Provider, Model (dropdown list), Review strategy, System prompt | 36 | ☐ |
| D4 | **Skills** tab | **All** workspace skills listed (not only linked ones); each has a checkbox, a **type badge** (rubric / convention / security / custom) and a description | 37 | ☐ |
| D5 | Type in the filter box | The list narrows by name | 30 | ☐ |
| D6 | Tick 3 skills and look at the ⠿ handles | Ticked & globally-enabled rows have an active handle and ↑/↓ arrows. **Unticked rows have a dimmed handle and no arrows** | 31 | ☐ |
| D7 | Drag an enabled row above another enabled row | Order changes. Dragging an unticked row does nothing; dropping onto an unticked row does nothing | 31 | ☐ |
| D8 | Save skills | Toast `Agent skills saved`; reload the page → same order and ticks | 13 | ☐ |
| D9 | Create a throw-away agent (Agents → **New agent**), then 🗑 on its card | Confirm **modal** (Cancel / Delete / ✕). After Delete it disappears | 33, 34 | ☐ |
| D10 | DB check: `docker exec -it devdigest-postgres psql -U devdigest -d devdigest -c "select name from agents;"` | The deleted agent is not listed | 33 | ☐ |

## E. Experiments — criteria 14, 16, 17, 18, 19, 20  (uses a real model, a few cents)

**Set-up (once).** Settings → API Keys: an OpenRouter key must be set (`server/.env` already has it). GitHub token is in `server/.env`.
Repos → **Add repository** → `vzhut/api-contract-demo` → wait for the clone/**Indexed** badge → open its **Pull Requests**; you should see
**#1 Tidy the runs API** and **#2 Add a budget guard for runs** (import them if the list is empty: Sync/Refresh).

**Baseline procedure — do it exactly, the seed links skills to these agents already:**
Agents → agent → **Skills** tab → **untick every skill** → Save. (Ticked = attached.)

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| E1 | **API Contract Reviewer, no skills.** Confirm all ticks are off and saved. Open PR **#1** → **Run Review** → pick *API Contract Reviewer* → wait until done. Repeat **3 times** | Note per run: did it flag the `cost_usd → costUsd` rename / removed `tokens_out` / moved `/runs/:id` route? Expected: **not flagged** (0/3) | 18 | ☐ |
| E2 | PR page → **Agent runs** → *Review runs* → open the trace (log icon) → **Prompt assembly** | There is **no "Skills" block** at all | 20 | ☐ |
| E3 | API Contract Reviewer → Skills tab → tick `api-contract-gate` **and** `breaking-change-checklist` (from B7/B8) → Save. Run PR **#1** again, 3 times | Expected: the breaking change **is flagged**, with file:line and before/after (3/3) | 18 | ☐ |
| E4 | Open that run's trace → Prompt assembly | A separate **Skills (dynamic)** block with `≈ N tok` next to it; open it: both skills' text. Other blocks also show their own `≈ N tok`; the skills number is much smaller than the whole prompt | 19, 20 | ☐ |
| E5 | Skills tab: drag `breaking-change-checklist` **above** `api-contract-gate` → Save → run again → trace | In the Skills block the text of `breaking-change-checklist` now comes **first** | 14 | ☐ |
| E6 | Untick one skill → Save → run → trace | Only the remaining skill's text is in the Skills block; the unticked one is absent. Then also turn a skill **off globally** (Skills page toggle): it is absent even when ticked on the agent | 20 | ☐ |
| E7 | **Test Quality Reviewer, no skills** (untick all, Save). Run PR **#2**, 3 times | Baseline: **does not flag** the untested throw / over-budget branch or boundaries (0/3) | 17 | ☐ |
| E8 | Tick `test-coverage-nudge` + `mocking-discipline` → Save. Run PR **#2**, 3 times | Flags the **uncovered branch** and a **boundary case** (3/3) | 17 | ☐ |
| E9 | For every run, write down: agent, skills on/off, flagged Y/N, severity, cost. Send me the table | I record it in `skills-lab-completion.md` §4 | 17, 18 | ☐ |

If the baseline also catches the problem (or the skilled run misses it), don't fight it: tell me. The PR text is what we change, not the criterion.

## F. pr-self-review, hook off — criterion 21

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| F1 | In the repo: `git config --get core.hooksPath` | Prints nothing | 21 | ☐ |
| F2 | `git push --dry-run origin lesson-02-laba` | Runs without a "pr-self-review: … not reviewed" block | 21 | ☐ |
| F3 | Make a small edit in **both** `client/` and `server/` (e.g. add a comment line to one file in each), in Claude Code run `/pr-self-review --gates` | The report lists changed files from both packages and the routed skill sets for **both** (client: frontend-architecture / react / next / RTL; server: onion / fastify / drizzle / postgres) | 21 | ☐ |
| F4 | Revert the two edits: `git checkout -- .` | Clean tree | — | ☐ |

## G. Already proven by files/tests (nothing to do)

1, 2 (`wc -l */CLAUDE.md` = 1), 3, 4, 5 (skill contents read), 7, 9, 13, 15 (unit + e2e), 26–29, 30, 32, 35, 36. If you spot anything off while clicking, report it as its own step.

## Reporting back

Send results in any form, e.g. `A1-A7 ok, B4 fail: no red error, C8 ok, E1 done: 0/3 0/3 1/3`. When every row is ✅ I will:
1. mark the criteria in `skills-lab-completion.md` §2 and fill Validation/Completion in its Delivery log,
2. commit the results on `lesson-02-laba`,
3. merge the lab into `lesson-02-homework` and bring the homework spec back.
