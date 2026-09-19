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

_No entries yet._

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

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
