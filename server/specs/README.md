# specs — server

Intended API behaviour: endpoint contracts and error cases, run/review state machines, indexing and polling rules.
Not here: what the routes already do → `../README.md` · cross-package behaviour → `../../specs/`.
Linked from `server/CLAUDE.md` via *Use when*. Index each spec here.

- [`pulls-list.md`](pulls-list.md) — `GET /repos/:id/pulls`: GitHub sync, diff-stat backfill, and the derived `status` / `score` / `cost_usd` / `latest_findings` fields.
- [`run-history.md`](run-history.md) — `GET /pulls/:id/runs` (+ `findings` previews), active runs, cancel, delete, SSE events.

- [`../../specs/findings-popover.md`](../../specs/findings-popover.md) (cross-package) — `GET /repos/:id/pulls` returns `latest_findings`, `GET /pulls/:id/runs` returns per-run `findings` previews.
