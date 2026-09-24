# Intent Layer — manual verification checklist

Companion to [`intent-layer.md`](./intent-layer.md) (tasks T11–T15, R5, R10, R11, R12). Covers what the tests cannot prove: how the card and the badges actually look and read. Everything below runs on **seeded data**, so no LLM is called and nothing costs money.
**How to report:** send the step number and `ok` or `fail` + what you saw (e.g. `B2 fail — badge overlaps the title`). A section counts as passed only when all its steps are `ok`.

Status: ☐ not done · ✅ ok · ❌ fail

## 0. Start the stack

The seeded PR #482 must hold the **seeded** intent (model `seed`). On a normal dev DB it may already have been re-classified by a live model, so use an isolated stack:

```sh
# option 1 — already running from the manual-test session (nothing to do): http://localhost:3100
# option 2 — a fresh isolated stack (ephemeral Postgres :5433, API :3101, web :3100).
#   ./scripts/e2e.sh tears the stack down after the flows, so for a stack that stays up
#   run its steps by hand or ask for the keep-alive variant.
```

Or on your own dev DB: delete the PR #482 row (this cascades its runs and files) and run `cd server && pnpm db:seed`; the seed inserts the intent and the scoped finding only when the PR is missing.

Open http://localhost:3100, repository **acme/payments-api**, PR **#482 "Add rate limiting to public API endpoints"**.

**Do not click Re-classify.** It calls the real model with the shared key on a demo repo that does not exist on GitHub, and the result is meaningless.

## A. Overview tab — the intent card (R5, R11)

| # | Do | Expect | Status |
|---|---|---|---|
| A1 | Open the PR, stay on **Overview** | The **Intent** card is the first block, above everything else | ☐ |
| A2 | Read the top of the card | A quoted summary: "Add token-bucket rate limiting to the public API endpoints to stop abuse from unauthenticated clients." | ☐ |
| A3 | Look at the two columns | **IN SCOPE** lists 2 items with check icons: "Rate-limit middleware for public routes", "Rate-limit configuration". **OUT OF SCOPE** lists 1 item with an x icon: "Refactoring the user list endpoint" | ☐ |
| A4 | Look for **RISK AREAS** | Two chips: "Public webhook endpoints", "Hardcoded configuration values" | ☐ |
| A5 | Look at the badge and the footer | Confidence badge **Medium**; the footer names the model **seed** | ☐ |
| A6 | Look at the sources | A "Sources" line: title, description, changed files used; `specs/ratelimit.md` marked as unavailable | ☐ |
| A7 | Look for the missing-context notice | A warning that names `specs/ratelimit.md` (not found) | ☐ |
| A8 | Look for a stale banner | **None** (the seeded intent is for the current head) | ☐ |
| A9 | Hover or tab to the lists | Screen-reader labels exist: "2 in-scope items", "1 out-of-scope items" (inspect with the accessibility tree if you like) | ☐ |

## B. Agent runs tab — card and finding badges (R10, R11)

| # | Do | Expect | Status |
|---|---|---|---|
| B1 | Click the **Agent runs** tab | The same Intent card sits at the top of this tab too | ☐ |
| B2 | Find the finding "N+1 query in user list endpoint" | Severity **SUGGESTION**, an **Out of scope** badge, and the text **downgraded from WARNING** | ☐ |
| B3 | Find "Hardcoded Stripe secret key in commit" | Still **CRITICAL**, with **no** Out of scope badge | ☐ |
| B4 | Use the severity filter | The downgraded finding is counted and filtered as SUGGESTION, not WARNING | ☐ |

## C. Look and feel

| # | Do | Expect | Status |
|---|---|---|---|
| C1 | Dark theme | Card, chips and warning colours are readable; nothing clipped | ☐ |
| C2 | Light theme | Same; warn and ok colours are still distinguishable | ☐ |
| C3 | Narrow the window to phone width (~375 px) | The two scope columns stack; no horizontal page scroll; the header button does not wrap badly | ☐ |
| C4 | Zoom to 150% | The card stays inside its container, long items wrap | ☐ |
| C5 | Read the whole card once | The stale, low-confidence and missing-context notices (seen here only as far as the seed produces them) do not crowd the summary | ☐ |

## D. Settings — the classifier model (R12)

| # | Do | Expect | Status |
|---|---|---|---|
| D1 | Settings → **Models** | A row **PR Review · Intent** showing `deepseek/deepseek-v4-flash` and the word **default** | ☐ |
| D2 | Pick another model in that row, reload the page | The choice persists after reload | ☐ |
| D3 | Look at the other rows | They are unchanged | ☐ |

## E. Not coverable here (record, do not test)

- The loading, error and empty ("Detect intent") states need a PR without an intent or a failing API; they are covered by `IntentCard.test.tsx`.
- A live review whose findings carry `scope: out_of_scope`: not observed yet (the live smoke had 0 findings). It needs a real PR with findings and a small paid review (cents).
- Jira/Linear against real hosts.

## Result

| Section | Status |
|---|---|
| A. Intent card | ☐ |
| B. Agent runs tab | ☐ |
| C. Look and feel | ☐ |
| D. Settings | ☐ |

When done, tear the stack down:

```sh
kill $(lsof -t -iTCP:3100 -sTCP:LISTEN) $(lsof -t -iTCP:3101 -sTCP:LISTEN); docker rm -f devdigest-e2e-postgres
```
