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

_No entries yet._
