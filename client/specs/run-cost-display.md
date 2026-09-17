# Run cost display

Status: implemented (L01) · Scope: client surfaces only. Where the number comes
from on the server: `../../server/docs/run-cost.md`.

## Formatting — `src/lib/format-cost.ts`

`formatCostUsd(n)`:

| Input | Output | Rule |
|---|---|---|
| `null` / `undefined` / non-finite | `—` | **unknown**, never shown as `$0` |
| `0` | `$0.0000` | a real zero is a known cost |
| `< 0.01` | 4 decimals — `$0.0013` | |
| `0.01 ≤ n < 1` | 3 decimals — `$0.014`, `$0.060` | |
| `≥ 1` | 2 decimals — `$1.50`, `$12.35` | |

`formatTokensTotal(in, out)` → `"9,119 tok"` (en-US separators). A missing
direction counts as 0; both missing → `null`, so callers can omit the token part.

`RunCostBadge` variants:
- `compact` → bare price (`$0.014`);
- `detailed` → `"<tokens> · <price>"` (`9,119 tok · $0.0013`), falling back to
  the price alone when no tokens were recorded.
- Unknown renders muted.

## Surfaces

| # | Where | What | Rule |
|---|---|---|---|
| C1 | PR list → **COST** column (`PRRow`) | `compact` badge of `PrMeta.cost_usd` | sum over the PR's **successful** runs; no successful priced run ⇒ `—` |
| C2 | PR → Agent runs → **Timeline** tile (`RunHistory`) | `detailed` badge per run | shown **only for settled (`done`) runs**; a running run would show a half-counted, changing figure |
| C3 | PR → Agent runs → **Review runs** header (`ReviewRunAccordion`) | `detailed` badge from the review's joined run usage | absent usage ⇒ `—` (e.g. seeded reviews with no run) |
| C4 | Run **Trace drawer → Stats** (`TraceBody`) | a separate **COST** stat tile: `formatCostUsd(stats.cost_usd)` | traces from before cost tracking have no key ⇒ `—` |

## Must not

- Render `$0.00` or `$0` for an unknown cost anywhere.
- Trigger a request or LLM call to show cost; everything is already in the
  run, review, list or trace payloads.

## Tests

`src/components/run-cost-badge/RunCostBadge.test.tsx` (formatting ladder,
variants, unknown), `PRRow.test.tsx` (C1 sum / `—`), `RunHistory.test.tsx` (C2,
settled only), `RunTraceDrawer.test.tsx` (C4 COST tile). Server side:
`server/test/reviews.it.test.ts`, `server/test/backfill-cost.it.test.ts`.

## Delivery log

Reconstructed from commit `b1ff617` and the code; the work was done in an
earlier session, so no phase notes survive beyond what is listed here.

| Phase | Record |
|---|---|
| Initiation | Found that every LLM adapter already computed `costUsd` but `run-executor.ts` discarded it, and there was no `cost_usd` column (`server/INSIGHTS.md`, Session Notes 2026-09-16). |
| Planning | Cost is stored on the run and in the trace, and aggregated over `done` runs only. Unknown means `null` and renders `—`. |
| Implementation | Migration `0010`, persistence in `run-executor.ts`, PR list `SUM`, review ↔ run join, backfill script, and the C1–C4 surfaces with `RunCostBadge` (commit `b1ff617`). |
| Validation | Unit tests, integration tests (sum, failed-only ⇒ `null`, no runs ⇒ `null`, backfill), trace test. The split commit's snapshot type-checks in all 3 packages; client 42 and server-unit 102 tests pass. |
| Completion | Insights recorded: entrypoint guard with a space in the path, `.nullish()` for jsonb contracts, failed runs storing tokens `0`. Committed as `b1ff617`. |
