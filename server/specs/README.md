# specs — server

Intended API behaviour: endpoint contracts and error cases, run/review state machines, indexing and polling rules.
Not here: what the routes already do → `../README.md` · cross-package behaviour → `../../specs/`.
Linked from `server/CLAUDE.md` via *Use when*. Index each spec here.

- [`../../specs/findings-popover.md`](../../specs/findings-popover.md) (cross-package) — `GET /repos/:id/pulls` returns `latest_findings`, `GET /pulls/:id/runs` returns per-run `findings` previews.
