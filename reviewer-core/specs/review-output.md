# `reviewPullRequest` output — invariants

Status: implemented · Code: `src/review/run.ts`, `src/review/reduce.ts`,
`src/output/to-review.ts` · Tests: `test/run.test.ts`, `test/to-review.test.ts`.
Background: `../docs/pipeline.md`, `../docs/scoring-and-grounding.md`.

For every successful call, the returned outcome satisfies:

| # | Invariant |
|---|---|
| O1 | `review.findings` ⊆ findings returned by the model(s), and every one passed grounding |
| O2 | `review.score === scoreFromFindings(review.findings)`, in `[0, 100]`; the model's score never leaks through |
| O3 | `review.verdict` is one of `request_changes` / `comment` / `approve`; in map-reduce it is the worst of the partials |
| O4 | `grounding === "<review.findings.length>/<candidates>" + " passed"` and `dropped.length === candidates − review.findings.length` |
| O5 | `mode` is `single-pass` when `strategy='single-pass'`, or when the diff has one file, or when `auto` and total changed lines ≤ the threshold |
| O6 | `tokensIn` / `tokensOut` are the sums over all chunk calls |
| O7 | `costUsd` is the sum over chunks **only if every chunk priced**; any `null` ⇒ `null` (unknown, never a partial number) |
| O8 | `chunks` has one entry per LLM call: whole diff for single-pass, one per changed file for map-reduce |
| O9 | no DB, filesystem or GitHub access; the only I/O goes through `input.llm` |

## Failure behaviour

| Situation | Behaviour |
|---|---|
| Model output isn't valid JSON / fails the Zod schema | reprompt with the concrete issues, up to `maxRetries` (default 2) extra attempts; then throw |
| `checkCancelled()` throws before a chunk | the error propagates unchanged (the server maps it to `status='cancelled'`) |
| Provider error (missing key, HTTP failure) | propagates; the server persists the run as `failed` with the message |

## `countBlockers(findings, failOn)` / gate

- Returns the count of findings with severity rank ≥ `FAIL_ON_MIN_RANK[failOn]`
  (`critical` 3 · `warning` 2 · `any` 1 · `never` ⇒ always 0).
- Must use the **grounded** findings (the server passes `outcome.review.findings`).
