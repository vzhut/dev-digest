# Writing a flow that stays deterministic

The flow format and runner knobs are in `../README.md`. This page covers how to
write assertions that actually fail when the UI is wrong, using only the allowed
locators (`--url`, `--text`, `find role|text|label`). Every pattern below is used
by a flow in `../specs/`.

## Checklist for a new flow

1. **Name** it `specs/NN-kebab-name.flow.json`. The number sets the run order, and all
   flows share one browser session.
2. **Start from `{BASE}/`** and follow real navigation, the way a user would.
3. **Wait for data before interacting.** After a route change, add
   `["wait", "--load", "networkidle"]`. Clicking before the page settles fails
   with "none match name …" even though the element exists a moment later.
4. **Assert with the step itself.** `wait --text`, `wait --url` and `find …` exit
   non-zero on a timeout or no match, and that exit fails the flow.
5. **Use seeded, read-only data** (repo `acme/payments-api`, PR #482, seeded
   agents). Nothing a flow does may call an LLM.
6. **Run it hermetically** with `./scripts/e2e.sh` from the repo root. Never
   point it at your dev DB: flow `02` assumes the demo repo is the only one.

## Assertion patterns

| Need | Pattern | Example |
|---|---|---|
| Something appears | `["wait", "--text", "<visible text>"]` | `04`: seeded finding title |
| A route or tab is active | `["wait", "--url", "tab=findings"]` | `04`, `05` |
| Click a control | `["find", "role", "button", "click", "--name", "<accessible name>"]` (name match is a case-insensitive substring) | `04`: `Show only CRITICAL findings` |
| Hover to reveal | `["find", "role", "button", "hover", "--name", "…"]` | `02`: FINDINGS severity icons |
| Text *inside* a region | `["find", "role", "tooltip", "text"]` + `"assert": {"stdoutIncludes": "…"}` | `02`: popover header |
| Something **disappeared** or a count changed | give the region an accessible name that carries the count, then `["find", "role", "list", "text", "--name", "1 finding shown", "--exact"]`. With `--exact`, a stale count means no match, exit 1, and the step fails | `04`: severity filter |
| Close an overlay before the next step | `["press", "Escape"]` | `02` |

### Gotchas

- **CSS `text-transform` changes what you read back.** `find … text` and
  `get text` return `innerText`, so an `uppercase` header comes back as
  `2 FINDINGS IN THIS RUN`. Assert the rendered case.
- **Don't use CSS selectors** (`wait "[role=tooltip]"`,
  `get count "[data-…]"`). They are outside the locator rule, and code review
  will flag them. Add an ARIA role or name to the component instead, which also
  improves accessibility.
- **Absence can't be asserted with `wait --text`.** Use the named-region pattern
  above.
- **First run on a fresh checkout** needs `cd e2e && npm install`, otherwise the
  runner dies with `tsx: command not found` after booting the stack. A 500 with
  `No system user found — run pnpm db:seed` means the seed didn't run (see
  `server/INSIGHTS.md`).

## Debugging a failing step

- A failure screenshot is saved to `test-results/<flow-id>-fail.png`.
- Reproduce against the running dev stack interactively:
  `agent-browser open http://localhost:3000/...`, then run the same `find` or
  `wait` commands one by one, and `agent-browser close` when done.
- `E2E_STEP_TIMEOUT` (ms, default 60000) bounds each command.
