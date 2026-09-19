# Data flow — API client, query keys, live runs

How server data reaches a component, and how the PR page stays current while
reviews run. Route map and hook → endpoint table: `../README.md`.

## Layers

```
component ──► hook (src/lib/hooks/<domain>.ts, TanStack Query) ──► api.ts (apiFetch) ──► Fastify :3001
```

- **`src/lib/api.ts`** — the only place that calls `fetch`. Base URL from
  `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`). It sends
  `content-type: application/json` **only when there is a body**, because a body-less POST
  with that header trips Fastify's "Body cannot be empty". Every failure becomes
  an `ApiError(message, status, code, details)`, and network failure is
  `status 0, code "network_error"`. The UI branches on these to choose between a toast, an inline error or a full-screen error.
- **Hooks** own query keys, polling and cache invalidation. Components never
  build URLs or call `fetch` (`../AGENTS.md`).
- **Types** come from `@devdigest/shared` (the client's own copy in
  `src/vendor/shared/`). They are never re-declared locally.

## Query keys that matter for reviews

| Key | Hook | Endpoint | Refresh policy |
|---|---|---|---|
| `["pulls", repoId]` | `usePulls` (`src/lib/hooks/core.ts`) | `GET /repos/:id/pulls` | every 60 s + on window focus (the server re-syncs GitHub on each call) |
| `["reviews", prId]` | `usePrReviews` | `GET /pulls/:id/reviews` | on demand; invalidated by run/finding/delete mutations |
| `["pr-runs", prId]` | `usePrRuns` | `GET /pulls/:id/runs` | every 4 s **while any run is `running`**, otherwise idle |
| `["pr-active-runs", prId]` | `usePrActiveRuns` | `GET /pulls/:id/runs/active` | every 4 s while the list is non-empty |

## A review run, from the client's side

1. `useRunReview` → `POST /pulls/:id/review`. The response already contains
   `run_id`s (the server creates rows before doing any work).
2. The PR page reads "in progress" from `["pr-active-runs"]`, not from local
   state, so it survives navigation and reload.
3. `useRunEvents(runIds)` opens one `EventSource` per run on
   `/runs/:id/events` and accumulates `RunEvent`s for the Live Log. A stream
   closes when its run completes.
4. On completion `page.tsx` invalidates `["pr-active-runs"]` and `["pr-runs"]`
   and refetches `["reviews"]`. The Timeline and Review runs then render the
   persisted result.

## Finding actions

`useFindingAction` → `POST /findings/:id/(accept|dismiss)`, then invalidates
`["reviews", prId]`. The button labelled **Reject** sends `dismiss`, which is
stored as `dismissed_at`. The `a` / `d` keyboard shortcuts in `FindingsPanel` use the same
mutation on the focused card.

## Derived-only UI (no extra requests)

Several L01 surfaces are pure functions of data already in these queries:
severity pills and filter, the "Hide low confidence" toggle, the findings
popover counts, and cost formatting. Toggling them must never trigger a fetch.
The e2e flows and specs assert this (`../specs/run-severity-filter.md`).
