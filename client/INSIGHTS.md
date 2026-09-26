# client — insights

Findings that cost real debugging time. Append new entries; don't rewrite old ones.
Cross-package findings belong in the root `INSIGHTS.md`.

## What Works

_No entries yet._

## What Doesn't Work

### Closing a popover on capture-phase `scroll` also kills scrolling inside it

`src/components/findings-popover/FindingsPopover.tsx:78` · 2026-09-17

Symptom: in the PR list, the findings popover had a max height, and the scrollbar was visible but scrolling didn't work. A long file path also added a horizontal scrollbar.

The popover closed itself with `window.addEventListener("scroll", close, true)`, so it wouldn't float away from its trigger when the page scrolls. `scroll` doesn't bubble, which is why the listener is in the capture phase. But a capture-phase listener on `window` also receives scrolls of *every* element, including the popover's own list. Every attempt to scroll the popover closed it.

What replaced it: the popover shows every finding with no inner scroll. It is rendered hidden, `scrollHeight` is measured in `useLayoutEffect`, and `popoverPosition()` then places it below the trigger, above it, or shifted to fit. Only a popover taller than the viewport gets `maxHeight`. The scroll listener now ignores events whose `target` is inside the popover:

```ts
const onScroll = (e: Event) => {
  if (e.target instanceof Node && popoverRef.current?.contains(e.target)) return;
  close();
};
```

## Codebase Patterns

### An SSE subscription hook keys on a joined id string, not the array it is given

`client/src/lib/hooks/reviews.ts:191-250` · 2026-09-20

`useRunEvents(runIds)` is called with an inline array (`useRunEvents([run.id])`), so a dep of
`[runIds]` re-runs the effect on every parent render: every EventSource is closed and reopened,
`events` is reset to `[]` and the Live Log blinks. The old code hid this with
`// eslint-disable-next-line react-hooks/exhaustive-deps` and `[key]`, where `key = runIds.join(",")`.

The honest form keeps the joined string as the identity but derives the ids from it —
`const ids = React.useMemo(() => (key ? key.split(",") : []), [key])` — and depends on `[ids]`.
A callback prop (`onSettled`) can't go in the deps for the same reason, so it is held in a ref
updated by an unconditional effect and read as `onSettledRef.current?.()` when the last stream
closes. Result: no disabled lint rule, and the subscription survives parent re-renders.

## Tool & Library Notes

### A Server Component that imports `@devdigest/ui` crashes every page under `next dev`, but `next build` passes

`src/app/_components/NotFoundView/NotFoundView.tsx:1-3` · fix commit `a5a4d72` · 2026-09-19

Symptom: after adding a server-component `app/not-found.tsx` that imported `EmptyState` from `@devdigest/ui`, `./scripts/e2e.sh` ended with `web never became reachable on :3100`. The dev server log repeated `⨯ TypeError: Super expression must either be null or a function at …/src/vendor/ui/charts/LineChart.tsx`, and `GET / 500`. `pnpm exec next build` and `next start` served the same code fine, including the 404 page.

`@devdigest/ui`'s `index.ts` re-exports `charts/`, which pulls in recharts' class components (`extends React.Component`). In the React Server Components graph `React.Component` is not available, so evaluating the barrel on the server throws. `next dev` evaluates `not-found` for every route, so one server import took down the whole app.

Keep every `@devdigest/ui` import in a `'use client'` file. Server files (`page.tsx`, `layout.tsx`, `not-found.tsx`) render a client View from `_components` and don't touch the UI kit, which is also the thin-page rule in the `frontend-architecture` skill. Check a new server file with `next dev` + `curl`, not only `next build`.


### A click inside a portalled popover still fires the clickable row it came from

`src/components/findings-popover/FindingsPopover.tsx:138-146` · 2026-09-17

The findings popover is rendered with `createPortal(…, document.body)` so the PR list table card (`overflow: hidden`) can't clip it. In the DOM it is no longer inside the PR row, but React bubbles *synthetic* events along the **React** tree, not the DOM tree. A click on a preview inside the popover therefore reaches the `onClick` of `PRRow`, which calls `router.push`, and the user gets navigated away.

I confirmed it with a mutation check. With `onClick={stop}` removed from the popover root, the test "never lets a click reach the parent row" fails with `onParentClick` "Number of calls: 1".

Fix: stop propagation on the portal root, and on the trigger itself, which sits in the row:

```tsx
<div role="tooltip" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}>
```

The `preventDefault` on `mousedown` serves a second purpose. It keeps focus on the trigger, so its `onBlur` close doesn't fire while the pointer is still inside the popover.

## Recurring Errors & Fixes

### `@testing-library/user-event` is not installed, so the skill's `userEvent.setup()` tests don't compile

`client/package.json` (devDependencies) · 2026-09-24

The `react-testing-library` skill tells agents to always use `userEvent`, and the intent-card plan asks for click flows. Importing it fails in both places: `tsc` reports `TS2307: Cannot find module '@testing-library/user-event'` and vitest fails the suite with `Failed to resolve import "@testing-library/user-event"`. Only `@testing-library/react` (with `fireEvent`) and `jest-dom` are present, and every existing client test uses `fireEvent`. Use `fireEvent.click` here; adding the dependency would touch `package.json` and the lockfile, which needs a deliberate decision.


### `borderColor` is a shorthand too — toggling it next to `borderLeftColor` still warns

`src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:5` · 2026-09-17

Symptom: the Next dev overlay shows a Console Error on the PR page when the focused finding card changes (`j`/`k`, or clicking a severity pill): "Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor) can lead to styling bugs." Vitest prints the same text to stderr, and the tests still pass.

The card style already carried a comment saying "all-longhand" and avoided `border` / `borderLeft`. But `borderColor` is itself a shorthand for the four side colours. React warns when a shorthand *changes* between renders while an overlapping longhand is set. Here `borderColor` flips with `focused`, and `borderLeftColor` is always set. Shorthands whose value never changes (`borderWidth: 1` next to `borderLeftWidth: 3`, `borderStyle`) don't warn.

Fix: give each side its own colour whenever the value depends on state.

```ts
borderTopColor: focused ? sevColor : "var(--border)",
borderRightColor: focused ? sevColor : "var(--border)",
borderBottomColor: focused ? sevColor : "var(--border)",
borderLeftColor: sevColor,
```

Check it with `pnpm test 2>&1 | grep -c "Updating a style property"`, which should print 0.

### `apiFetch` labelled every body as JSON, so browser file uploads failed while curl and unit tests passed

`client/src/lib/api.ts:36` · `client/src/lib/hooks/skills.ts:112` · 2026-09-21

Importing `breaking-change-checklist.zip` through the UI showed "Request body size did not match Content-Length"
(a `.md` fared no better: "Body is not valid JSON but content-type is set to 'application/json'"). The same file
posted with `curl -F` returned 200, and every test was green: the drawer tests mock `useImportPreview`, and the
server tests post multipart directly, so nothing exercised the one place the header is decided.

`apiFetch` adds `content-type: application/json` whenever `init.body != null`. A `FormData` body needs the browser
to write `multipart/form-data; boundary=…` itself; a hand-set JSON header overrides it and Fastify parses binary
multipart bytes as JSON. Fixed by skipping the header for `FormData` (`api.test.ts` pins it). Reproduce without a
browser: `curl -H 'content-type: application/json' --data-binary @x.zip $API/skills/import/preview`.

## Session Notes

### 2026-09-20 — client improvement plan finished

`client/docs/improvement-plan.md` "Delivery log" · every item but #15 (unused `mermaid-diagram`)
and the `react-best-practices` skill alignment is implemented on `lesson-02`. The last slices:
RunHistory split into `helpers.ts` + `_components/RunRow`/`CommitRow`, `useRunEvents` gained
`onSettled`, remaining inline styles moved to `styles.ts` and the last PR-detail strings to
`messages/en/prReview.json`. No `eslint-disable` and no `style={{…}}` are left outside the frozen
`src/vendor/ui`. Validation: `pnpm typecheck`, `pnpm test` (23 files / 108 tests), `pnpm build`,
`./scripts/e2e.sh` 7/7.

### 2026-09-22 — L02 homework: Conventions Extractor page + Create-skill modal

`src/app/repos/[repoId]/conventions/` · `src/lib/hooks/conventions.ts` · 2026-09-22

New route (page + `ConventionsView` + `ConventionCard` + `CreateSkillModal`), following
`frontend-architecture` throughout — no new debt. Promoted `relativeTime` out of
`pulls/helpers.ts` into `lib/relative-time.ts` on its second consumer (§7's promotion ladder),
test moved with it. `pr-self-review`'s routed UI review (slice 10) caught one real finding —
five repeated inline `margin` values in `ConventionsView.tsx` that duplicated what belonged in
`styles.ts` — fixed. `messages/en/conventions.json` already existed as a mockup-era stub with no
consumers and a different button layout than what the actual C12 design needed; rewritten rather
than extended. Validation: `pnpm typecheck`, `pnpm test` (44 files / 196 tests),
`./scripts/e2e.sh` 9/9 (new flow `09-conventions.flow.json`).

## Open Questions

_No entries yet._
