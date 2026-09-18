# Scoring, grounding and blockers — the deterministic layer

The model proposes findings; three pure functions decide what the user sees.
They exist because model self-reports drift between models and runs. For example, a cheap model has
"approved" with zero findings and still returned a score of 10.

## Grounding — `groundFindings` (`src/grounding.ts`)

A finding is **kept** only if:

1. its `file` is one of the diff's changed files, **and**
2. its `[start_line, end_line]` range (order-insensitive) intersects at least one
   new-side line covered by a hunk of that file. Hunk lines come from
   `newLineNumbers` when present, otherwise from the declared
   `newStart … newStart + max(newLines, 1) - 1` range.

**Full-file kinds** (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`) skip
rule 2. They come from whole-file scanners, not diff hunks, so the file only has to be in the
diff. Anything else, including a missing `kind`, is a diff finding.

Dropped findings carry a reason (`file 'x' not present in diff` /
`lines a-b do not intersect any diff hunk in 'x'`) for the live log. The
summary string is `"<kept>/<total> passed"`, stored on the run and shown in the
trace.

**Why mandatory:** without it a model cites lines that don't exist. GitHub then
rejects inline comments (422), and the UI links to nowhere.

## Score — `scoreFromFindings` (`src/review/reduce.ts:27`)

```
score = clamp(0, 100, 100 − Σ penalty(severity))   over GROUNDED findings
penalty: CRITICAL 35 · WARNING 12 · SUGGESTION 3
```

0 findings ⇒ 100 · one SUGGESTION ⇒ 97 · one WARNING ⇒ 88 · one CRITICAL ⇒ 65 ·
three CRITICAL ⇒ 0. The model's own `score` is ignored, so the number on screen can
never contradict the findings list under it.

## Verdict — passed through

`verdict` is taken from the model (worst-of in map-reduce). That's why every
reviewer prompt must spell out the verdict mapping
(`../../docs/agent-prompts/README.md`). The deterministic signals below,
not `verdict`, drive colours and gates.

## Blockers & gate — `countBlockers` / gate check (`src/output/to-review.ts`)

Severity ranks: SUGGESTION 1 · WARNING 2 · CRITICAL 3. An agent's `ciFailOn`
sets the minimum rank that blocks: `critical` 3 (default) · `warning` 2 ·
`any` 1 · `never` ∞. `blockers` = number of grounded findings at or above that
rank. The server stores it on the run, and the timeline shows `rejected` whenever
blockers > 0, whatever the model's verdict says.

## `confidence` is not used here

`confidence` (0–1) is carried through untouched. Nothing in the engine filters
or weights by it. The client's "Hide low confidence" toggle (< 0.65) is purely
presentational. Some models emit `0` for every finding (see the root
`INSIGHTS.md`), which hides the whole run behind that toggle.
