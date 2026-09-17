# Severity counters + filter in a review run

Status: implemented (L01), covered by e2e `04` · Scope: client only — no server, contract, or LLM changes.

## Where

PR detail → **Agent runs** tab (`?tab=findings`) → **Review runs** section → an
expanded `ReviewRunAccordion`. The counters row sits directly under the
`VerdictBanner` (verdict + PR SCORE) and above the findings list.

Not here: the severity icons + hover popover on **Timeline** tiles and the PR
list — separate spec: [`../../specs/findings-popover.md`](../../specs/findings-popover.md).

## Behaviour

### Counters row

- One pill per severity: `N CRITICAL · N WARNING · N SUGGESTION`, always in that
  order. Each pill = severity icon + count + label (never colour alone).
- **Only severities with N > 0 are rendered.** No zero pills.
- No findings visible → the row is not rendered at all.

### What is counted

Counts are computed on the client by grouping the run's already-loaded
`review.findings` by `severity`. Opening the page or toggling a filter makes
**no** new request and **no** LLM call.

The input to the count is the list **after the "Hide low confidence" toggle**,
and **before** the severity filter:

```
review.findings
  → hide-low-confidence (confidence < 0.65 dropped when the toggle is on)
  → COUNT BY severity        ← pills
  → severity filter          ← cards rendered below
```

Consequences:

- The number on a pill always equals the number of cards of that severity shown
  when that pill is active (acceptance check: pill "3 CRITICAL" → click → exactly
  3 cards).
- Toggling "Hide low confidence" re-counts; a severity whose findings are all
  hidden loses its pill.
- Selecting a pill does **not** change the counts, so the other pills stay
  visible and clickable.
- Dismissed and accepted findings are counted — they are still rendered (muted).

### Filter

- Default: no filter, the full list (sorted CRITICAL → WARNING → SUGGESTION, as today).
- Click a pill → only that severity's cards remain; the pill shows an active state
  (`aria-pressed="true"`).
- Click the active pill again → filter cleared, the full list returns.
- Click a different pill → switches directly to that severity (single-select).
- If "Hide low confidence" removes every finding of the active severity, the
  filter resets to "none" automatically (never strand the user on an empty list
  with no pill to click).
- State is local to one accordion: filtering one run does not affect other runs,
  and it is not persisted (collapse/reload → cleared).
- `j`/`k` navigation and `a`/`d` shortcuts act on the filtered list; the focused
  index resets to the first card whenever the visible list changes (pill click,
  hide-low-confidence toggle, automatic filter reset).

### Accessibility

Pills are `<button>`s with `aria-pressed`, reachable by Tab, toggled by
Enter/Space. Label example: "Show only CRITICAL findings (3)".
The findings list is a named ARIA list ("3 findings shown") whose count follows
the visible cards — screen readers hear the effect of a filter, and e2e asserts
on it by role instead of CSS selectors.

## Out of scope

- Multi-select filters, filter persistence in the URL.
- Renaming the finding's **Dismiss** button (the acceptance wording calls it
  "Reject"; the label stays "Dismiss").

## Tests

- Severity grouping helper (shared with the Timeline / PR list popover, see
  [`findings-popover.md`](../../specs/findings-popover.md)) — order, zero
  severities omitted, empty input. `FindingsPanel/helpers` — filter by severity.
- `FindingsPanel` (RTL) — pills match cards; click filters; second click clears;
  hide-low re-counts and drops a pill; auto-reset when the active severity
  disappears.
- e2e `04-pr-findings.flow.json` — seeded PR #482: pill visible → click → only
  that severity's card remains.
