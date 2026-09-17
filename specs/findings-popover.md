# Severity icons + "N findings in this run" popover (PR list & PR timeline)

Status: implemented (L01) · Scope: `@devdigest/shared` contract (both copies) +
`server` (pulls list, PR run history) + `client` (PR list row, Timeline tile).
No LLM calls, no migration.

Companion spec (PR detail → Review runs pills + filter):
[`../client/specs/run-severity-filter.md`](../client/specs/run-severity-filter.md).

## Surfaces

| # | Page | Where | Which run |
|---|---|---|---|
| 1 | Pull Requests list `/repos/:repoId/pulls` | new **FINDINGS** column, between SCORE and STATUS | the PR's **latest review** (`reviews.kind='review'`, newest `created_at`) — same review as the SCORE column |
| 2 | PR detail → Agent runs → **Timeline** | each run tile, in place of the "N findings" text | **that run** (`reviews.run_id = agent_runs.id`) |

Both surfaces render the same trigger (severity icons) and the same popover.
Neither has buttons — actions stay on the Review runs finding cards.

## Contract

In `contracts/findings.ts` (both `server/src/vendor/shared/` and
`client/src/vendor/shared/`):

```ts
/** Read-only projection of a finding for hover previews. */
export const FindingPreview = Finding.pick({
  id, severity, category, title, file, start_line, end_line, confidence,
}).extend({ summary: z.string() }); // rationale, truncated to 200 chars
```

Additions (nullish, so older payloads still parse):

| Schema | Field | `null` / absent | `[]` |
|---|---|---|---|
| `PrMeta` (list endpoint only) | `latest_findings: FindingPreview[]` | PR never reviewed | latest review has no findings |
| `RunSummary` | `findings: FindingPreview[]` | run produced no review (running / failed / cancelled) | review has no findings |

- Counts are always derived on the client by grouping the array by `severity`;
  there is no separate counts field that could drift from the list.
- Rejected (`dismissed_at`) and accepted findings are included (matches the Review runs cards).
- Order: CRITICAL → WARNING → SUGGESTION, then `file`, then `start_line`.
- `summary` = `rationale` with markdown kept as-is, cut at 200 chars + `…`.

## Server

- One shared helper (`server/src/modules/_shared/finding-previews.ts`):
  `findingPreviewsByReview(db, reviewIds) → Map<reviewId, FindingPreview[]>` —
  a single `IN (…)` query, projection + truncation + ordering in one place.
- `GET /repos/:id/pulls`: the existing latest-review query also selects the
  review `id`; then one `findingPreviewsByReview` call for all listed PRs.
- `GET /pulls/:id/runs` (`listRunsForPull`): one query for reviews whose
  `run_id` is in the listed runs, then one `findingPreviewsByReview` call.
- Both stay batched: a fixed number of queries regardless of row count (no N+1).
- `findings_count` / `blockers` on runs are unchanged.

## Client

### Shared component — `src/components/findings-popover/`

Used by both surfaces (like `run-cost-badge`):

- **Trigger** — a `<button>` holding one icon + count per present severity
  (e.g. ⊘2 ⚠1 💡1), dotted underline as the hover affordance, severity colours
  from `SEV`. `aria-expanded` reflects the popover.
- **Popover**
  - Opens on pointer hover over the trigger and on keyboard focus.
  - Closes on pointer leave (≈150 ms grace so the pointer can travel into the
    popover and stay open while over it), Escape, or blur.
  - Rendered in a **portal** on `document.body` — the PR list table card has
    `overflow: hidden` and would clip it on the last rows.
  - **Shows every finding, no inner scroll.** The popover is measured, then
    placed below the trigger if it fits entirely, else above, else shifted to
    fit anywhere on screen. Only a popover taller than the viewport itself gets
    a max height and scrolls (that inner scroll must not close it).
  - Long file paths wrap; nothing scrolls horizontally.
  - Header: **"N FINDINGS IN THIS RUN"** (ICU plural, N = array length).
  - Body: one preview per finding in contract order.
  - Stops click propagation at its root — React bubbles synthetic events through
    portals, so without it a click inside would trigger the PR row's navigation.
- **Preview item** (read-only text): severity icon, title, category tag,
  `file:line` (or `file:start-end`), confidence as `%`, `summary` clamped to 2
  lines as plain text. **No buttons, no links.**
- Severity grouping reuses one helper shared with the Review runs pills.

### Surface 1 — PR list row

| `latest_findings` | FINDINGS cell |
|---|---|
| null (never reviewed) | muted `—` |
| `[]` | muted `0` |
| non-empty | trigger + popover |

Clicking the trigger does not navigate; clicking elsewhere on the row still does.
`GRID` + `COLUMN_KEYS` + `list.columns.findings` gain the new column.

### Surface 2 — Timeline run tile

| Run | Tile line |
|---|---|
| not settled (running / failed / cancelled) | unchanged (no icons) |
| settled, `findings` non-empty | trigger + popover, followed by the existing ` · N blockers` |
| settled, `[]` or missing | unchanged "0 findings" text |

## Out of scope

- Filtering from the popover or the list; clicking a preview to jump to a finding.
- The list's per-row "Run Review" button seen in mockups.
- Any change to how findings are produced or stored.

## Tests

- server `contracts.test.ts`: `PrMeta.latest_findings` and `RunSummary.findings`
  accept previews and may be omitted.
- server `reviews.it.test.ts`:
  - list — unreviewed PR → null; reviewed without findings → `[]`; only the
    **latest** review's findings, ordered, `summary` truncated;
  - runs — done run → its own review's previews; failed run → null.
- client:
  - `findings-popover` — hover opens with the right header; Escape/leave closes;
    previews contain no buttons/links; a click inside doesn't reach the parent.
  - `PRRow` — `—` / `0` / trigger per case; trigger click doesn't navigate.
  - `RunHistory` — icons only on settled runs with findings; blockers text kept.
- e2e `02-repo-pulls-detail.flow.json` — hover PR #482's FINDINGS cell → "2
  findings in this run" (seeded review: 1 CRITICAL + 1 WARNING). Needs
  agent-browser `hover`; verify it exists. Timeline has no e2e: the seeded review
  has no `run_id`, so seeded data shows no run tiles.

## Delivery log

| Phase | Record |
|---|---|
| Initiation | The PR list and runs endpoints carried no finding data, the UI kit had no popover, and nothing used portals. Traps found up front: the list table card has `overflow: hidden` (the popover would be clipped), React bubbles clicks out of portals (they would navigate the row), and seeded reviews have no `run_id` (no Timeline e2e possible). |
| Planning | This spec, first covering only the PR list, then extended to Timeline tiles after comparing with the mockups. Decisions: one `FindingPreview` contract, `null` vs `[]` semantics, latest review = same row as SCORE, batched queries, no migration. |
| Implementation | 4a: contract (both copies), `_shared/finding-previews.ts`, `pulls/routes.ts`, `run.repo.ts`. 4b: `components/findings-popover`. 4c: FINDINGS column in `PRRow`. 4d: `RunHistory` tiles. A bug found in manual testing (a non-working inner scroll, a horizontal scrollbar, a broken title row) led to measure-then-place with no inner scroll. Commit `a126c77`. |
| Validation | Server 140 tests (incl. integration: `null` / `[]` / latest-only / ordering / truncation / run previews). Client 80 tests (popover: open/close, no buttons, clicks don't reach the row, confirmed by mutation; placement cases). reviewer-core typecheck. Hermetic e2e 7/7, and flow `02` hovers PR #482 and reads `2 FINDINGS IN THIS RUN`. Manually checked on PR #24 (6–13 findings). Code review: no spec gaps; standards fixes applied. |
| Completion | Insights: `client/INSIGHTS.md` (portal click bubbling, capture-phase scroll), root `INSIGHTS.md` (`confidence: 0` comes from the model). The `seed.ts` entrypoint fix that unblocked local e2e was committed separately (`a3bfb29`). |

