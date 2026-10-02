# e2e — insights

Findings that cost real debugging time. Append new entries; don't rewrite old ones.
Cross-package findings belong in the root `INSIGHTS.md`.

## What Works

### Assert that something *disappeared* with a named ARIA list, not a CSS count

`specs/04-pr-findings.flow.json:16` · `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:96` · 2026-09-17

`wait --text` and `find` can only prove that something is **present**. A filter check ("after clicking CRITICAL, the WARNING card is gone") needs an absence or count assertion. The quick answer, `get count "[data-finding-id]"`, is a CSS selector, which this suite's locator rule forbids (README: `--url`, `--text`, `find role|text|label` only).

What works: give the list a role and an accessible name that carries the visible count. The name then *is* the assertion. `find role list … --exact` exits 1 when no list has that name, so a stale count fails the step:

```tsx
<div role="list" aria-label={t("panel.shownCount", { count: shown.length })}>  // "1 finding shown"
```
```json
{ "cmd": ["find", "role", "list", "text", "--name", "1 finding shown", "--exact"] }
```

Use `--exact`, because the name match is otherwise a case-insensitive substring. Confirmed against the dev stack: after filtering, `--name "2 findings shown" --exact` exits 1. It also helps accessibility, since screen readers hear the filter's effect.

Related: popover text rendered with `text-transform: uppercase` comes back **uppercase** from `find … text` / `get text` (innerText). Assert `"2 FINDINGS IN THIS RUN"`, not the source string.

## What Doesn't Work

### `find text … click` right after `wait --url /pulls` races the PR list fetch

`specs/04-pr-findings.flow.json:7` · `specs/05-pr-diff.flow.json:7` · 2026-09-19

Symptom: `✗ open the PR row — Command failed: agent-browser find text Add rate limiting to public API endpoints click`, and the failure screenshot shows the PR list still as skeleton rows ("Loading pull requests…"). Flow 05, which runs the same two steps, passed in the same run.

`wait --url /pulls` only proves the route changed. The list is fetched client-side after hydration (and the API first tries a GitHub sync that fails offline), so the row can appear after `find` gives up. It depends on timing, e.g. a cold `next dev` compile of the route.

Wait for the row's text before interacting with it, as flow 02 already did:

```json
{ "cmd": ["wait", "--text", "Add rate limiting to public API endpoints"], "label": "seeded PR title row is visible" },
{ "cmd": ["find", "text", "Add rate limiting to public API endpoints", "click"], "label": "open the PR row" }
```

## Codebase Patterns

_No entries yet._

## Tool & Library Notes


### `scripts/e2e.sh` does not isolate secrets, so a flow can trigger a paid call

`scripts/e2e.sh` · `server/src/platform/config.ts:84,91` · 2026-10-02

The "hermetic" stack still reads secrets from `~/.devdigest/secrets.json` and falls back to `process.env`, and clones from `~/.devdigest/workspace`. On a machine with an LLM key, a flow that clicks an LLM-backed action (Generate) makes a real, paid, nondeterministic call, and which seeded repo has a clone depends on the developer's home directory. Flow 13 therefore never clicks Generate and asserts only navigation and the `not_cloned` state of the `clonePath: null` seed. Isolating HOME and the clone dir in `e2e.sh` would be a separate change.

## Recurring Errors & Fixes

### `./scripts/e2e.sh` boots the whole stack, then dies with `sh: tsx: command not found`

`scripts/e2e.sh:110` · 2026-09-17

On a checkout where `e2e/node_modules` doesn't exist yet, the hermetic runner does all of its setup first: Postgres, migrate, seed, API, web. Only then, at `npm test` → `tsx run.ts`, does it exit 127 with `sh: tsx: command not found`, and it tears everything down again. The script installs `server/` and `client/` deps when they are missing, but never `e2e/`'s own.

Fix: install once before the first run:

```sh
cd e2e && npm install      # or: cd e2e && npm install && npm run e2e:hermetic
```

If every flow instead fails with API 500 `No system user found — run \`pnpm db:seed\``, that is the seed entrypoint guard on a path with a space. See the entrypoint-guard entry in `server/INSIGHTS.md`.

### A flow green on the local stack can fail in CI on a role lookup that depends on the Chrome build, or on CSS

`e2e/specs/12-project-context.flow.json` · 2026-10-01

Flow 12 passed 12/12 locally (agent-browser 0.38.1) and failed on the GitHub runner with the page fully rendered (the `e2e-failure` artifact screenshot showed it). Two lookups were the cause: `find role heading --name "Project Context" --exact` (the h1 has `text-transform: uppercase`, so its accessible name is `PROJECT CONTEXT`), and `find role complementary --name "Project Context"` on an `<aside aria-label>` (whether an `aside` inside the page is exposed as `complementary` depends on the Chrome build: local passed, CI's Chrome for Testing did not). The version of agent-browser was identical in both (0.38.1), so it is the browser, not the CLI.

For a new page assert what is plain text in the DOM (`wait --text "specs,docs,insights"`) and use `find role button|list` for controls, which are stable across Chrome builds; avoid landmark roles and headings whose styling changes the name. After any UI change made *after* a flow was last run, re-run `./scripts/e2e.sh`; flow 12 was written before the two-pane restyle and broke without anyone noticing until CI. To reproduce CI without touching your dev server's `client/.next`, run the script from a scratch `git worktree` with `node_modules` symlinked in, and download the screenshot with `gh run download <run-id> -n e2e-failure`.

## Session Notes

_No entries yet._

### 2026-09-21 — substring button names make flows flaky

`e2e/specs/08-skills.flow.json:14` · 2026-09-21

`find role button click --name Stats` matches by case-insensitive substring, so once more UI shares the page
(the skills list, card badges) the click intermittently hit a different button and failed on a *different* step each
run (`Stats`, then `Skills`). Adding `--exact` made 8/8 pass twice in a row; a `networkidle` wait alone did not help.
Use `--exact` for short names like tab labels.

### 2026-09-25 — off-screen click silently no-ops in CI; `--exact` fails on names with a count

`e2e/specs/04-pr-findings.flow.json:16` · 2026-09-25

Flow 04 failed in CI (`✗ only the CRITICAL finding card remains`, `find role list --name "1 finding shown"`) but passed
locally, in `next dev` and in `next build && next start`. A temporary DIAG dump in `run.ts` showed why: after L03 the
IntentCard pushes the findings panel down, so the severity pill sits at y≈913 in a 1280x577 viewport
(`elementFromPoint` → `null`). `find role button click` on it reported success in CI, but `aria-pressed` stayed `false`
500 ms later; locally the same click worked. `window.scrollY` is 0 either way, so it is not a page scroll.
Fix: `scrollintoview <selector>` before the click, then `wait --fn` on `aria-pressed === 'true'`. Green in CI after that.
Ruled out (did not help): `wait --load networkidle`, polling with `wait --fn`, viewport size (same locally), agent-browser
version (0.38.1 both). Lesson: a "successful" `find … click` proves nothing — assert the state change it should cause,
and scroll below-the-fold targets into view first.

Also: the pill's accessible name is `Show only CRITICAL findings (1)` (`client/messages/en/prReview.json:37`), so
`--exact` on `--name "Show only CRITICAL findings"` fails deterministically. Don't use `--exact` on names with a
`({count})` suffix. Flow 09 (`wait --text repo-conventions`) flaked twice locally on a cold first run; unrelated, not fixed.

## Open Questions

_No entries yet._
