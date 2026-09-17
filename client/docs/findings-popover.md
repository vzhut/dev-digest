# FindingsPopover — how a hover preview survives tables, portals and scroll

`src/components/findings-popover/`. Behaviour spec:
`../../specs/findings-popover.md`. This page explains the **implementation
choices** and the traps they avoid.

## Anatomy

| File | Role |
|---|---|
| `FindingsPopover.tsx` | trigger button (severity icons + counts) and the portalled popover; open/close state and positioning |
| `FindingPreviewItem.tsx` | one read-only preview row |
| `helpers.ts` | `fileLineLabel`, `popoverPosition` (pure, unit-tested) |
| `constants.ts` | `CLOSE_DELAY_MS` 150, `POPOVER_WIDTH` 400, `POPOVER_GAP` 6 |
| `styles.ts` | colocated `s` style object |

Counts come from `severityCounts` in `src/lib/severity.ts`. The Review runs
pills use the same helper, so both surfaces always agree.

## Decisions

### Portal to `<body>`
The PR list table card has `overflow: hidden`, so an absolutely-positioned child
is clipped on the last rows. The popover is therefore `createPortal`ed and uses
`position: fixed`.

**Trap:** React bubbles *synthetic* events along the React tree, not the DOM tree.
A click inside the portal still reaches the PR row's `onClick` and navigates.
Both the trigger and the popover root stop `click`. The root also stops
`mousedown` and calls `preventDefault` on it, which keeps focus on the trigger so the blur-close doesn't
fire mid-click. Covered by `FindingsPopover.test.tsx` → "never lets a click
reach the parent row", which was confirmed by mutation. See `../INSIGHTS.md`.

### Measure, then place: show everything, no inner scroll
The popover renders once with `visibility: hidden`, and `useLayoutEffect` reads
its `scrollHeight`. `popoverPosition(triggerRect, viewport, {width, height, gap})` then picks:

1. below the trigger if it fits entirely;
2. above it if it fits there;
3. shifted to fit anywhere in the viewport (8 px margin);
4. only if it is taller than the viewport: top-aligned with `maxHeight` and scroll.

Horizontal position is clamped inside the viewport. Long paths use
`overflow-wrap: anywhere`, so nothing scrolls sideways.

### Closing rules
- Pointer leaves the trigger or the popover: close after `CLOSE_DELAY_MS`.
  Entering the popover cancels the close, so the pointer can travel into it.
- `Escape` closes. So do resize and **page** scroll, because a fixed popover
  would otherwise detach from its row.
- **Trap:** `scroll` doesn't bubble, so the listener is on `window` in the
  capture phase, and that also sees scrolls *inside* the popover. `onScroll`
  ignores events whose `target` is inside `popoverRef`. Otherwise the popover
  would close whenever someone tried to scroll it.
- Click only **opens** (touch has no hover). A toggle would close the popover
  that the hover just opened.

### Accessibility
The trigger is a `<button>` with `aria-expanded`, and its `aria-label` is the header text
("3 findings in this run"). The popover has `role="tooltip"` and is referenced by
`aria-describedby` while open. Previews contain no interactive elements.

## Reuse

Pass any `FindingPreview[]`. Surfaces decide what to render when the list is
`null` or empty (`—`, `0`, or plain text) — the component itself renders nothing
for an empty array.
