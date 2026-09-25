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

_No entries yet._

## Recurring Errors & Fixes

### `./scripts/e2e.sh` boots the whole stack, then dies with `sh: tsx: command not found`

`scripts/e2e.sh:110` · 2026-09-17

On a checkout where `e2e/node_modules` doesn't exist yet, the hermetic runner does all of its setup first: Postgres, migrate, seed, API, web. Only then, at `npm test` → `tsx run.ts`, does it exit 127 with `sh: tsx: command not found`, and it tears everything down again. The script installs `server/` and `client/` deps when they are missing, but never `e2e/`'s own.

Fix: install once before the first run:

```sh
cd e2e && npm install      # or: cd e2e && npm install && npm run e2e:hermetic
```

If every flow instead fails with API 500 `No system user found — run \`pnpm db:seed\``, that is the seed entrypoint guard on a path with a space. See the entrypoint-guard entry in `server/INSIGHTS.md`.

## Session Notes

_No entries yet._

### 2026-09-21 — substring button names make flows flaky

`e2e/specs/08-skills.flow.json:14` · 2026-09-21

`find role button click --name Stats` matches by case-insensitive substring, so once more UI shares the page
(the skills list, card badges) the click intermittently hit a different button and failed on a *different* step each
run (`Stats`, then `Skills`). Adding `--exact` made 8/8 pass twice in a row; a `networkidle` wait alone did not help.
Use `--exact` for short names like tab labels.

### 2026-09-25 — `--exact` fails on buttons whose aria-label carries a count

`e2e/specs/04-pr-findings.flow.json:16` · 2026-09-25

The severity pill's accessible name is `Show only CRITICAL findings (1)` (`client/messages/en/prReview.json:37`), so
`find role button click --name "Show only CRITICAL findings" --exact` fails deterministically
(`✗ click the CRITICAL severity pill`). Don't add `--exact` to names with a `({count})` suffix.
Flow 04 also flaked once in CI on the L03 branch (`find role list --name "1 finding shown"` ~150 ms after the click,
green locally and on main); the async IntentCard now sits above the findings on the Agent runs tab, so a
`wait --load networkidle` before the pill click was added (3/3 local runs green after). Root cause not proven.
Flow 09 (`wait --text repo-conventions`) flaked once locally on a cold first run.

## Open Questions

_No entries yet._
