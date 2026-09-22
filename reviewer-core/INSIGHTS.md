# reviewer-core — insights

Findings that cost real debugging time. Append new entries; don't rewrite old ones.
Cross-package findings belong in the root `INSIGHTS.md`.

## What Works

_No entries yet._

## What Doesn't Work


### A grounding-dropped finding left a stale `request_changes` verdict behind it

`src/review/run.ts:208` (fix) · `src/review/reduce.ts` (`verdictFromFindings`) · `test/run.test.ts` · 2026-09-22

A run showed a red "rejected" badge (`review.verdict === 'request_changes'`) with **zero findings** and a 100
score. The model's only finding was a real CRITICAL, but it cited a wrong line number (`src/schemas.ts:8` for a
change actually on line 4 — a plausible off-by-N miscount, not a wrong file), so `groundFindings` correctly
dropped it (`grounding.ts:4` — grounding is the mandatory mechanical gate, working as designed). `run.ts` already
recomputes `score` from the grounded findings (`scoreFromFindings(ground.kept)`), but left `merged.verdict` — the
model's PRE-grounding self-report — untouched, so the persisted verdict disagreed with the findings under it.

Fixed with `verdictFromFindings` (same shape as `scoreFromFindings`, in `reduce.ts`): `request_changes` iff a
CRITICAL survived grounding, `comment` for any lesser finding, `approve` for empty — applied at the same line
that sets `score` in `run.ts`. `test/run.test.ts` covers the all-hallucinated case (a `request_changes` fixture
whose only finding is grounded away must produce `verdict: 'approve'`).

Lesson: when one pipeline step (grounding) changes which findings survive, every downstream field derived from
findings needs the SAME post-step recompute. Fixing `score` alone left `verdict` — and any client reading it
(here, the server's `ReviewRunAccordion` badge) — inconsistent with the findings actually shown.

## Codebase Patterns

_No entries yet._

## Tool & Library Notes

_No entries yet._

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
