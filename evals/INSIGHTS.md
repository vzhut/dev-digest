# evals — insights

Findings that cost real debugging time. Append new entries; don't rewrite old ones.
Cross-package findings belong in the root `INSIGHTS.md`.

## What Works

### Agent edit measured before/after: `architecture-reviewer` now reviews an inline diff

`.claude/agents/architecture-reviewer.md` (commit `d820472`) · 2026-10-08

The edit: "A **diff file is required input**" became "a diff is required input, either a diff file path or the
unified diff pasted inline; a missing base ref alone never blocks". Measured with
`pnpm eval:repeat agents/architecture-reviewer/ -n 3 --label arch-{before,after}-fx` (the tool capped `-n 3` to 2
runs) and `pnpm eval:delta arch-before-fx arch-after-fx` (`evals/results/` is gitignored — this table is the record), same 4 cases, same fixtures (`79f5ea9`), only the
agent definition differing:

| case | before | after |
|---|---|---|
| checkout diff: both violations, path:line, rule, severity | 50% | **100%** |
| reviewer-core: fs import + skipped `groundFindings()` | 0% | **50%** |
| benign rename → "No findings." | 50% | **100%** |
| "out-of-scope" security-shaped change | 100% | 0% (see below) |
| cases passed per run, summed | 4/8 | 5/8 |

n=2 per side, so this is indicative, not significant. Mechanism of the gain: with the old text the agent answered
`## Clarification needed` ("No diff file path was provided") on most runs and never looked at the diff, even though
the same reply said it could "work from the inline diff only". The 0%→100% on the out-of-scope case is the same
effect seen on the original fixtures (`arch-before` → `arch-after`, 0%→100%).

## What Doesn't Work

### A "must not flag X" case passes vacuously when the agent does not review at all

`evals/agents/architecture-reviewer/architecture-reviewer.cases.ts` (case "out-of-scope security-shaped change") · 2026-10-08

The negative case scored 100% before the agent edit, 0% after — which reads as a regression and is not one. Before,
the agent returned only a Clarification block, so it trivially "did not invent a violation". Once it actually
reviewed, it reported `reply?: FastifyReply` in the domain signature as a layering finding, which is correct under
its own rule ("SDK/Drizzle/Fastify types never in service or helper signatures") but contradicted the practice. The
practice was narrowed to "no runtime-bug or security finding for that parameter" (layering finding allowed).
Takeaway: pair every negative case with a positive one on the SAME input that proves the agent actually reviewed,
and read the `results/outputs/*.md` text before trusting a green negative. A residual miss remains — the agent
still adds out-of-scope remarks ("optional parameters hint at implicit behavior", "prevents mocking in tests"),
`stays scoped to structural/layering/DI findings…` is 0/2 — a real, small scope-drift of the agent, not yet fixed.

### Fixture diffs must name files that exist in the working tree

`evals/agents/architecture-reviewer/fixtures/*.diff` (`79f5ea9`) · 2026-10-08

The agent verifies diff paths against the checkout. `reviewer-core/src/pipeline/run.ts` and
`server/src/modules/blast/score.ts` do not exist (the real files are `reviewer-core/src/review/run.ts` and
`server/src/modules/blast/helpers.ts`), so the agent stopped with "this file does not exist in the repo" instead of
auditing the diff. A hypothetical new module (`modules/checkout/`) is fine — only edits to non-existent files bounce.

### `eval:workflow` writes to the real repo — `engineering-insights` appended a fake entry to `server/INSIGHTS.md`

`evals/workflow/review-workflow.cases.ts` (activation case) · `server/INSIGHTS.md` · 2026-10-08

Running `pnpm eval:workflow` locally loads the live harness with `bypassPermissions`; the "engineering-insights
activates on a genuine discovery" case hands the model an invented pgvector finding and the skill really wrote it
(8 lines in `server/INSIGHTS.md`, `git status` showed ` M server/INSIGHTS.md`). Happened on both full runs. After every
local workflow run: `git status --short` and `git checkout -- <file>` for anything the eval touched. CI is safe (disposable checkout).

### Workflow cases pointed at docs that do not exist in this repo

`evals/workflow/review-workflow.cases.ts` · 2026-10-08

`server/docs/api-contracts.md` and `reviewer-core/insights/gotchas.md` are not in the repo (real: `server/docs/review-run-lifecycle.md`,
`reviewer-core/INSIGHTS.md`), so two cases failed on the first run (`reads: … not read`, `subagents: expected [] to include
'architecture-reviewer'`). The dispatch case failing was a knock-on effect: told to consult a missing doc, the model never
reached the "run the subagent" step. After retargeting both, the dispatch case passed in all later runs. Final state:
`pnpm eval:workflow` 5/5 on the targeted rerun, 4/5 on a full run.

### `pipeline task follows CLAUDE.md routing to pipeline.md` is flaky (~1 in 5)

`evals/workflow/review-workflow.cases.ts` · 2026-10-08

Passed 4 of 5 runs on identical files. The failing run read both `AGENTS.md` files but never opened
`reviewer-core/docs/pipeline.md`. `eval:repeat workflow -n 2 -t "pipeline task"` was 2/2. Treat a single red as noise;
re-run before blaming a `CLAUDE.md`/`AGENTS.md` edit.

### Cases copied from a demo asserted rule IDs and a verdict the agent never produces

`evals/agents/architecture-reviewer/architecture-reviewer.cases.ts` (`45ab767`) · 2026-10-08

The template cases required the identifiers `reviewer-core-zero-io` / `inward-only-dependencies` and an explicit
"PASS/FAIL gate verdict". Neither exists in the repo (`grep -r reviewer-core-zero-io` hits only the cases) and the
agent definition says it gives "no PASS/BLOCK verdict"; those practices could never pass. Practices now follow the
agent's own output contract (`path:line`, `<skill> §<n>`, severity, recommendation, no verdict). When adopting an
eval package, diff every practice against the artifact it grades before running anything.

## Codebase Patterns

### CI only evaluates an eval whose artifact still exists

`evals/scripts/ci-detect.mjs` · `.github/workflows/eval-{skills,agents,workflow}.yml` · 2026-10-08

`evals/agents/architecture-reviewer-lite/` is a demo A/B twin whose agent is not in `.claude/agents/`; running it
would fail on a missing artifact. `ci-detect.mjs` now treats an eval without its `.claude/{skills,agents}` artifact
as `SKIP`, same as a skill/agent without any eval (`CHANGED_FILES=… node evals/scripts/ci-detect.mjs` to try it).

## Tool & Library Notes

### `eval:repeat` silently caps `-n` at 2

`evals/src/repeat.ts` · 2026-10-08

`pnpm eval:repeat … -n 3` prints `capping -n 3 → 2 (token economy)`; delta output is flagged "stddev indicative only".
Plan for noisy cases (a 50% practice is one run each way), or raise the cap in `repeat.ts` before a serious A/B.

## Open Questions

- Does `deepseek/deepseek-chat` (used for the skills CI job) match the "deepseek-v4-flash" model other lessons use via
  OpenRouter? Only `deepseek-chat` is verified for this package's content tier.
