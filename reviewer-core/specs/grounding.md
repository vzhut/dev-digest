# Grounding gate — required behaviour

Status: implemented · Code: `src/grounding.ts` · Tests: `test/run.test.ts`
(full run keeps the valid finding, drops the hallucinated one) and the server's
`server/test/grounding.test.ts` + `server/test/reviews.it.test.ts`.
Background: `../docs/scoring-and-grounding.md`.

## Must

| # | Given | Then |
|---|---|---|
| G1 | finding in a file that is not in the diff | dropped — reason `file '<f>' not present in diff` |
| G2 | diff finding whose line range touches ≥ 1 hunk line of its file | kept |
| G3 | diff finding whose range touches no hunk line | dropped — reason `lines a-b do not intersect any diff hunk in '<f>'` |
| G4 | `start_line > end_line` | treated as the same range reversed (never auto-dropped for order) |
| G5 | single-line finding exactly on the first/last added line of a hunk | kept (inclusive bounds) |
| G6 | hunk without `newLineNumbers` | lines derived from `newStart … newStart + max(newLines,1) − 1` |
| G7 | `kind` ∈ {`secret_leak`, `lethal_trifecta`, `phantom`, `hook`} in a changed file | kept regardless of lines |
| G8 | full-file `kind` in a file NOT in the diff | dropped (rule G1 still applies) |
| G9 | `kind` missing/null | treated as a diff finding (G2/G3 apply) |
| G10 | any input | `kept.length + dropped.length === findings.length`; order of kept findings preserved |
| G11 | summary | `groundingSummary` returns `"<kept>/<total> passed"` (e.g. `"0/0 passed"` for no findings) |

## Must not

- Consult `confidence`, `severity` or `title` — grounding is purely positional.
- Mutate the input findings.
- Be skipped for either review mode: it runs once, after reduce, for both
  single-pass and map-reduce.

## Adding a new finding `kind`

Decide whether it is hunk-anchored (default — nothing to do) or a full-file
scanner (add it to `FULL_FILE_KINDS` and a row like G7 here). A new kind must be
added to the `FindingKind` enum in `@devdigest/shared` — both copies.
