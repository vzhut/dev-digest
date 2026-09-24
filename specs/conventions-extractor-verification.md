# Conventions Extractor — manual verification checklist

Companion to [`conventions-extractor.md`](./conventions-extractor.md). Everything the tests cannot prove is here, in the order to do it.
**How to report:** send the step number and `ok` or `fail` + what you saw (e.g. `B3 fail — evidence link 404s`). The status column is updated
from your answers; a criterion counts as passed only when **all** its steps are `ok`.

Status: ☐ not done · ✅ ok · ❌ fail

## 0. Start the stack (once slice 1 has landed)

```sh
git checkout lesson-02-homework
cd server && pnpm db:migrate && pnpm db:seed   # new migration in this work — do not skip
cd .. && ./scripts/dev.sh --no-seed            # Postgres already migrated/seeded above
```

Open http://localhost:3000. Settings → API Keys: an OpenRouter key must be set (needed for the
`conventions` feature model, C2). Repos → **Add repository** → a real repo you can clone (the
seed repo `acme/payments-api` has `clonePath: null` — nothing to read, per §7 trap) → wait for the
**Indexed** badge (repo-intel must have finished, or `extract` 409s).

## A. Run Scan, candidates list — criteria 38, 39, 40, 46

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| A1 | Open the repo's **Conventions** page before any scan | Empty state, one primary **Run Scan** button | — | ☐ |
| A2 | Press **Run Scan** | Button disables, progress text shows; when done, a list of candidate cards appears | 38 | ☐ |
| A3 | Look at the header | "Detected from N sample files · last scan <relative>" + a quality line: `kept X of Y · Z dropped (reasons…)` | 39, 40 | ☐ |
| A4 | Look at one card | Rule as title, evidence `path:line-line`, code snippet, confidence bar **with %** (green ≥ 0.8 / amber ≥ 0.6 / muted below) | 46 | ☐ |
| A5 | Try **Run Scan** on a repo not yet indexed | 409 surfaced as guidance ("index the repo first"), not a generic error toast | — | ☐ |
| A6 | Try a repo whose scan legitimately finds nothing | "nothing qualified" empty result, not treated as an error | — | ☐ |

## B. Evidence links — acceptance #2

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| B1 | Click a card's evidence link | Opens a **new tab** on `github.com/<owner>/<repo>/blob/<sha>/<path>#L<a>-L<b>` at the right lines | acc. #2 | ☐ |
| B2 | Click the copy-path button | Path copied (paste somewhere to confirm) | — | ☐ |
| B3 | Compare the snippet shown in the card with the file on GitHub at those lines | Identical text — snippet is read from the file, not the model's text | 40 | ☐ |

## C. Accept / Reject / Edit / persistence — criteria 47, 48, 49, acceptance #3, #5

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| C1 | On a card, look at the buttons | Three **labelled** buttons: **Accept**, **Reject**, **Edit** (not a single toggle) | 47 | ☐ |
| C2 | Press **Reject** | Card collapses to one line with **Undo** | — | ☐ |
| C3 | Press **Undo** | Card expands back to its previous state | — | ☐ |
| C4 | Press **Edit** on a card | Rule switches to an inline field; **Enter** saves, **Esc** cancels | 49 | ☐ |
| C5 | Save an edit | Card shows an **edited** chip; `rule !== ruleOriginal` | 49 | ☐ |
| C6 | Accept 2, reject 1, leave the rest pending, then **reload the page** | Same statuses survive the reload | acc. #3 | ☐ |
| C7 | Press **ReScan** (button label, not "Run analysis") | New candidates appear; previously accepted/rejected rows are **kept**, not reset to pending | 45, 48 | ☐ |
| C8 | Note the rejected rule's text, ReScan again | That exact rule does **not** resurface as a new pending candidate | acc. #3, 48 | ☐ |
| C9 | DB check: `docker exec -it devdigest-postgres psql -U devdigest -d devdigest -c "select status, rule, fingerprint from conventions where repo_id = '<repoId>';"` | Statuses match what the UI shows | — | ☐ |

## D. Create skill modal — criteria 41, 42, 50, 51, 52

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| D1 | With **0** candidates accepted | **Create skill** button is **hidden**, not just disabled | 50 | ☐ |
| D2 | Accept ≥ 1 candidate | **Create skill** button appears | 50 | ☐ |
| D3 | Press **Create skill** | Modal prefilled: name `repo-conventions`, description `N house conventions extracted from <repo>`, editable Markdown body, token count, footer says it lands as `v1` in Skills Lab | 41, 51 | ☐ |
| D4 | Look at the modal body | Only **accepted** rules appear; a rejected/pending rule is **absent** | acc. #5 | ☐ |
| D5 | Edit the body text directly, then edit Name/Description | Fields update live, token count changes | 41, 51 | ☐ |
| D6 | Look for **Attach to agents** | Multi-select, no agent preselected, lists all agents | 42 | ☐ |
| D7 | Pick one agent, press **Create skill** | Toast + deep-link to that agent's **Skills** tab | 42 | ☐ |
| D8 | Go to **Skills** page | `repo-conventions` v1 is listed, source shows as extracted | 52 | ☐ |
| D9 | Open the agent from D7 → Skills tab | `repo-conventions` is **ticked/linked**, appended last | 42, acc. #6 | ☐ |
| D10 | Repeat Create skill on the **same repo** (name clash) | Modal offers **rename** or **update the existing skill**, inline — not a generic error | — | ☐ |
| D11 | Press **Cancel** in the modal instead of Create | Modal closes, nothing new in Skills list | 41 | ☐ |

## E. Nav entry — criteria 44

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| E1 | Look at the sidebar | **Conventions** entry under **SKILL LAB** (not under WORKSPACE) | 44 | ☐ |
| E2 | Click it while a repo is open | Navigates to `/repos/:repoId/conventions` | 44 | ☐ |

## F. Model + cost — criteria 53

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| F1 | Settings → Feature Models | `conventions` row lists the cheap seed model as default (not `gpt-5.4`), via a `SearchableSelect` | 53 | ☐ |
| F2 | Change the `conventions` model to something else, save, Run Scan again | The new model is actually used (check the scan's `model` field / trace) | 53 | ☐ |
| F3 | Check a scan's cost | `convention_scans.cost_usd` is populated, not null | — | ☐ |

## G. API Contract Reviewer experiment — criterion 43, acceptance #7

Reuses the lab's baseline procedure (`skills-lab-verification.md` §E) on the same repo/PR
(`vzhut/api-contract-demo`, PR #1).

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| G1 | Skills page | Four skills exist: `api-contract-gate` (seeded), `breaking-change-checklist` (imported, enabled), `response-schema` (created), `deprecation-policy` (created) — each with a directive description and a good/bad example | 43 | ☐ |
| G2 | Confirm `breaking-change-checklist` (or `semver-discipline`) travelled the **Import** path | Lands disabled → enabled by hand (check its source badge) | 43 | ☐ |
| G3 | API Contract Reviewer → Skills tab → **untick all** → Save → confirm in the trace: no "Skills" block | Baseline is clean | — | ☐ |
| G4 | Run PR #1 on the baseline, 3× | Record: findings on the 3 breaking changes (rename, removed field, moved route), any severity/semver classification | acc. #7 | ☐ |
| G5 | Tick all 4 skills, order = block order intended, Save | Trace shows a Skills block with all 4 | 43 | ☐ |
| G6 | Run PR #1 with skills, 3× | Every distinct breaking change cited with file:line + before/after; major-vs-deprecation-eligible classification present | acc. #7 | ☐ |
| G7 | Compare G4 vs G6 | Fuller + correctly classified with skills — record honestly even if the baseline already caught something | acc. #7 | ☐ |

## H. Close the loop — §11.4, acceptance #6

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| H1 | Link the `repo-conventions` skill (from D) to API Contract Reviewer too | Appears in its Skills tab | acc. #6 | ☐ |
| H2 | Run PR #1 again with `repo-conventions` added | Note whether the result changes at all (may be "no change" — that's a valid finding) | §11.4 | ☐ |
| H3 | Open that run's trace → Prompt assembly | `repo-conventions` shows as its own block, with `≈ N tok` | acc. #6 | ☐ |

## I. pr-self-review before push — same as lab, hook still off

| # | Do | Expect | Crit. | Status |
|---|---|---|---|---|
| I1 | `git config --get core.hooksPath` | Prints nothing | — | ☐ |
| I2 | Before opening the PR, run `/pr-self-review` **by hand** | Report covers every touched package (server + client + reviewer-core if touched) | — | ☐ |

## J. Already proven by files/tests (nothing to do)

Server unit/`.it.test.ts` coverage per §9 of the spec: `verifyCandidate` edge cases, composer
(only-accepted / ordering / empty set), sampler caps, re-scan fingerprint survival, workspace
isolation, cascade delete. Client component tests for `ConventionCard` / `ConventionsView` /
`CreateSkillModal`. e2e flow `09-conventions.flow.json` (seeded scan on `acme/payments-api`,
accept/reject/edit → create skill → visible in `/skills`). If you spot anything off while
clicking through A–H, report it as its own step — the tests don't replace the click-through.

## Reporting back

Send results in any form, e.g. `A1-A6 ok, C8 fail: rejected rule came back, D1 ok, G4: 1/3 flagged something generic, G6: 3/3 full coverage`.
When every row is ✅ I will:
1. mark criteria 38–53 and the acceptance checklist (§12) in `conventions-extractor.md`,
2. fill the Delivery log's Validation/Completion entries,
3. run `pr-self-review` and open the PR with the quality report (§9) in the description.
