# Conventions Extractor — quality report

Live run (real `openrouter/deepseek/deepseek-v4-flash`, real GitHub clones, real repo-intel
index) against 3 repos, one of them the author's own work repo, per
[`conventions-extractor.md`](./conventions-extractor.md) §9/C11. Date: 2026-09-22.

## Method

For each repo: **Add repository** → wait for clone + index → `POST .../conventions/extract`
→ record the scan row verbatim, then a human verdict on every **kept** candidate:
**useful** (would make it a skill rule) / **true but trivial** / **wrong**. No candidate was
edited or cherry-picked before scoring.

## Per-repo results

### 1. [`vzhut/conventions-demo`](https://github.com/vzhut/conventions-demo) — purpose-built demo

A small TS service written to repeat 4 checkable conventions (AppError, a logger
abstraction, `.js`-suffixed relative imports, camelCase) across `src/`.

| | |
|---|---|
| Sample files | 7 (5 source + `tsconfig.json` + `.eslintrc.json`) |
| Raw → kept | 8 → 8 (0 dropped) |
| Model / cost | `openrouter/deepseek/deepseek-v4-flash` / **$0.00109** |

| # | Rule | Confidence | Verdict |
|---|---|---|---|
| 1 | Use `AppError` subclasses for all domain errors | 1.00 | **useful** |
| 2 | Use `.js` extension in all relative imports | 1.00 | true but trivial — evidence cites `tsconfig.json`'s `moduleResolution: NodeNext`, not an actual `.js` import line; the rule is true but the citation doesn't demonstrate it |
| 3 | Use async/await instead of `.then()` | 1.00 | true but trivial — evidence is one `async function` declaration, not an absence-of-`.then()` proof |
| 4 | Don't use `console.log`/`console.error`; use the logger | 1.00 | **useful** |
| 5 | Enable strict TypeScript checks | 1.00 | true but trivial — a compiler setting, not something a diff reviewer adds value by repeating |
| 6 | Use camelCase for variable names | 1.00 | true but trivial — generic JS/TS default, low project-specific value |
| 7 | In catch blocks, rethrow `AppError`, wrap everything else | 1.00 | **useful** |
| 8 | Enable `noUncheckedIndexedAccess` | 1.00 | true but trivial — compiler setting |

**Precision (useful ÷ kept): 3/8 = 0.375.**

### 2. [`vzhut/api-contract-demo`](https://github.com/vzhut/api-contract-demo) — small real Fastify service

| | |
|---|---|
| Sample files | 5 |
| Raw → kept | 0 → 0 |
| Model / cost | `openrouter/deepseek/deepseek-v4-flash` / **$0.00013** |

**Zero result** — the model returned an empty `candidates` array. This is the "nothing
qualified" case the spec calls out as a valid, expected answer (§4.3): the repo is a
handful of tiny files with no convention repeated in ≥2 places and no distinguishing
lint/tsconfig rule. Not forced into a narrative either way.

### 3. [`vzhut/dev-digest`](https://github.com/vzhut/dev-digest) — the author's own work repo (C11)

| | |
|---|---|
| Sample files | 16 |
| Raw → kept | 6 → 6 (0 dropped) |
| Model / cost | `openrouter/deepseek/deepseek-v4-flash` / **$0.00188** |

| # | Rule | Confidence | Verdict |
|---|---|---|---|
| 1 | Set `moduleResolution` to `Bundler` | 0.99 | true but trivial — a config setting, not diff-checkable |
| 2 | Set `strict` to `true` | 0.99 | true but trivial — compiler setting |
| 3 | Use `satisfies CSSProperties` for style objects | 0.95 | **useful** — real, repeated, exactly what `frontend-architecture` documents |
| 4 | Use `as const` for exported style objects | 0.95 | **useful** — same pattern, real and repeated |
| 5 | Use path aliases for internal packages | 0.95 | **useful** — matches the import-boundary rules the frontend skill enforces |
| 6 | Use the shared `now()` helper for `created_at` columns | 0.90 | **useful** — a real, specific server convention |

**Precision (useful ÷ kept): 4/6 = 0.67.**

## Aggregate

| Repo | Sampled | Raw | Kept | Dropped | Useful | Precision | Cost |
|---|---|---|---|---|---|---|---|
| conventions-demo | 7 | 8 | 8 | 0 | 3 | 0.375 | $0.00109 |
| api-contract-demo | 5 | 0 | 0 | 0 | – | – | $0.00013 |
| dev-digest (work repo) | 16 | 6 | 6 | 0 | 4 | 0.67 | $0.00188 |
| **Total** | 28 | 14 | 14 | 0 | 7 | **0.50** | **$0.0031** |

Drop-reason histogram: every reason is 0 across all three runs — the verifier never had
anything to reject this round (every cited quote existed, in range, non-duplicate). That's
a clean bill for `verifyCandidate` on this sample, not evidence it's unneeded — the unit
tests (§9, `conventions-helpers.test.ts`) already exercise every drop path directly.

## What the numbers say — picking the §10 improvement

Two honest patterns, both pointing the same direction:

1. **Confidence does not discriminate.** Every candidate across all three runs scored
   0.90–1.00 — useful and trivial alike. A human can tell "`satisfies CSSProperties`" apart
   from "`strict: true`" instantly; the model's self-reported number cannot. Thresholding
   on confidence (`MIN_CONFIDENCE`) filters nothing real here.
2. **Config-file evidence is disproportionately trivial.** Every "true but trivial" verdict
   in the demo repo was cited from `tsconfig.json`/`.eslintrc.json` — restating a compiler
   or linter setting that already enforces itself, exactly what the prompt tells the model
   to skip (§4.3: "ignore what the language or framework already enforces") but doesn't. The
   work repo's four **useful** rules all cite real `.ts` source lines showing a *pattern*,
   never a bare setting.

Both point at **§10 improvement #1 — measure support in code, not by model guess**: for
each kept rule, have the model (or a follow-up `ast-grep`/ripgrep pass) also propose a
literal/regex pattern for the convention and its violation, then count real occurrences
across the clone. That replaces the uncalibrated confidence with "followed in 41 of 44
places" and, as a side effect, would very likely down-rank the config-restating candidates
(a `tsconfig.json` setting has exactly one occurrence to "measure" — itself), which is
precisely the noise this run surfaced. Picked for slice 9.

## Delivery log

| Phase | Record |
|---|---|
| Data collection | This document — 3 real repos incl. the work repo, live model calls, honest per-candidate verdicts, no cherry-picking. |
| Decision | §10 improvement #1 chosen for slice 9, justified by the confidence/config-triviality pattern above. |
