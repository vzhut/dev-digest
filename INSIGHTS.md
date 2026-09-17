# DevDigest — insights

Cross-package findings that cost real debugging time. Append new entries; don't rewrite old ones.
Package-specific findings belong in that package's `INSIGHTS.md`.

## What Works

_No entries yet._

## What Doesn't Work

_No entries yet._

## Codebase Patterns

### `@devdigest/shared` is two hand-synced copies, and the client copy has drifted

`client/tsconfig.json:24` · `reviewer-core/tsconfig.json:22` · 2026-09-17

`diff -r server/src/vendor/shared client/src/vendor/shared` is not empty: the client copy lacks the `'openrouter'` provider id, the `commitFiles` / `findOpenPr` / `sync` / `diffNameOnly` adapter methods, and parts of `contracts/eval-ci.ts`, `knowledge.ts`, `productionize.ts` and `trace.ts`.

The name suggests one shared package, but each tsconfig points `@devdigest/shared` at its own folder. `server/` and `reviewer-core/` resolve to `server/src/vendor/shared/` (the canonical copy), while `client/` resolves to `client/src/vendor/shared/`. Nothing syncs them, so a contract change in the server type-checks cleanly while the client keeps the old shape.

Mirror every contract edit into both folders by hand. Don't copy whole files over to "fix" the drift: the missing pieces are lesson-era features the client doesn't use yet.


## Tool & Library Notes

_No entries yet._

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

### Why does a real review store `confidence: 0` on every finding?

`GET /repos/bb2312bb-a43b-46ca-8865-a9ac9dd16e43/pulls` (PR #24) · 2026-09-17

All six persisted findings of PR #24's latest review have `confidence: 0`, so the UI shows "0% conf" everywhere. With "Hide low confidence" on (threshold 0.65), every one of them would be hidden. The seeded findings (0.98 / 0.86) are fine, so the UI is not the cause.

Not investigated. The candidates are: the model actually returning 0 (e.g. a provider that doesn't honour the schema), `reviewer-core` dropping or defaulting the field while parsing the output, or the server's `insertFindings` persisting it wrong. The first thing to check is that run's trace (`GET /runs/:id/trace`) for the raw model output.

**Answered 2026-09-17: it's the model, not our pipeline.** Run `bf477bb5-c8f1-41e5-8ae6-739a09cd6c63` (Performance Reviewer, `deepseek/deepseek-v4-flash`): its trace `raw_output` literally contains `"confidence": 0` for all 6 findings, and the pipeline persisted them faithfully. The next Performance Reviewer run on the same PR, same model, returned 0.95 / 0.85. So the model sometimes emits 0 when it fills the required field. `confidence` is `z.number().min(0).max(1)` with no guidance in the prompt, so 0 is schema-valid. Side effect: "Hide low confidence" (threshold 0.65, `FindingsPanel/constants.ts`) hides *every* finding of such a run. Not fixed. Possible options: describe `confidence` in the schema/prompt, or treat an all-zero run as "confidence unknown".
