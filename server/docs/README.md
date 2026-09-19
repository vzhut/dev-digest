# docs — server

Deep-dives for `server`: repo-intel indexing, run lifecycle and SSE traces, the adapter/DI layer.
Not here: API map, DI diagram, env table → `../README.md` · findings → `../INSIGHTS.md`.
Linked from `server/AGENTS.md` via *Use when*. Index each document here.

- [`review-run-lifecycle.md`](review-run-lifecycle.md) — POST review → rows first → background executor → engine → persist → SSE; run statuses, the boot reaper, and the run ↔ review link without a foreign key.
- [`run-cost.md`](run-cost.md) — where `cost_usd` comes from (billed vs estimated), where it is read, why only successful runs are summed, and the backfill script.
