# docs — client

Deep-dives for `client`: query/cache strategy, live run traces, diff-viewer internals, i18n and theming.
Not here: route map and hook→endpoint table → `../README.md` · findings → `../INSIGHTS.md`.
Linked from `client/AGENTS.md` via *Use when*. Index each document here.

- [`data-flow.md`](data-flow.md) — `api.ts` → hooks → components, the query keys and polling rules behind the PR page, a review run seen from the client, derived-only UI.
- [`findings-popover.md`](findings-popover.md) — why the findings preview is portalled, measured and closed the way it is (portal click bubbling, capture-phase scroll, placement algorithm).
