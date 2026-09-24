# `pr-self-review` skill: a local gate before push and PR

Status: implemented (lesson-02) · Scope: `.claude/skills/pr-self-review/` (new), `.claude/settings.json` (new),
`.claude/skills/README.md`, root `AGENTS.md`. No runtime code changes.

Plan and research: [`docs/research/pr-self-review-skill-plan.md`](../docs/research/pr-self-review-skill-plan.md).

## Problem

The repo has eleven reviewer-grade skills, but nothing decides *which* of them applies to *which* changed file, and
nothing turns their findings into a decision. A change can be pushed and a PR opened while it breaks typecheck, edits a
generated migration by hand, renames a contract field in only one of the two `@devdigest/shared` copies, or references an
i18n key that doesn't exist. CI catches some of this after the PR is open; the rest is caught by a human, or not at all.

## Behaviour

`/pr-self-review [--base <ref>] [--full] [--accept <id> "reason"] [--quiet]` and a `PreToolUse` hook on
`gh pr create` · `gh pr merge` · `git push`:

1. Collect every open change: branch commits since the merge base, staged, unstaged, **and untracked** files.
   Fingerprint them, so a verdict is bound to the exact change set.
2. Run the deterministic gates (typecheck, unit tests, migrations, lockfiles, contract mirroring, secrets, i18n keys,
   module registry, onion greps) — no LLM, seconds.
3. Route each changed file to the project skills that apply, and review the added lines against those skills as the rubric.
   One inline pass for a small diff; three parallel sub-agents (UI · backend+domain · security) for a large one.
4. Merge findings onto one severity scale. One CRITICAL means **BLOCK**; everything else is reported.
5. Write `.git/pr-self-review/<fingerprint>.json`. The hook lets the GitHub command through only when a PASS marker
   exists for the current fingerprint, so any edit after a PASS re-opens the gate.

Out of scope: auto-fixing, the spec axis (that's the built-in `code-review` skill), and blocking the Merge button on
GitHub (a required CI check — lesson L06).

## Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Hook now, or leave hooks to L06? | Now. `PreToolUse` on `Bash`, matching the three GitHub-publishing commands; the hook only checks the marker |
| Q2 | Gate pushes from the user's own terminal? | Yes, `scripts/pre-push` via `git config core.hooksPath`. No CI job — that stays L06 |
| Q3 | Is a new architecture violation HIGH or CRITICAL? | HIGH. CRITICAL only for: `process.env` outside `platform/config`, an adapter importing `modules/`, a new DB/FS/GitHub call in `reviewer-core`, a module missing from `modules/index.ts` |
| Q4 | Sub-agents or one pass? | Inline under ~150 changed lines or a single group; three parallel sub-agents above that |
| Q5 | `.it` tests and e2e in the gate? | No by default (they need Docker and a full stack); `--full` opts in |
| Q6 | Relation to the built-in `code-review` skill? | Separate. This one routes project skills and gives a verdict; `code-review` keeps the deeper standards + spec read |
| Q7 | Override for a false BLOCK? | `--accept <id> "reason"`, recorded in the marker and carried into the PR description; repeats go to `references/accepted.md` |
| Q8 | Do HIGH findings ever block? | No. Only CRITICAL blocks |
| Q9 | Language of the skill files | English, like every other skill in the repo |
| Q10 | One verdict, or a fast tier? | Two tiers (2026-09-21). `gates` (~12s) opens `git push`; `full` is required for `gh pr create`/`merge`/`ready`. A branch push is cheap and reversible; handing the work to someone else is the part worth waiting for |

## Files

- `.claude/skills/pr-self-review/SKILL.md` — workflow, severity model, report format.
- `references/routing.md` — file pattern → skills, with the reason per row.
- `references/severity.md` — the shared scale and how each skill's own labels map onto it.
- `references/reviewer-prompt.md` — the brief a reviewer sub-agent gets, and its JSON output shape.
- `references/accepted.md` — accepted false positives (finding, reason, expiry).
- `scripts/collect.sh` — change set + fingerprint · `route.sh` — file → skill groups · `gates.sh` — R1–R13 ·
  `check-marker.sh` — the gate used by both hooks · `pre-push` — the git hook.
- `evals/evals.json`, `README.md`, `CHANGELOG.md`.
- `.claude/settings.json` — the `PreToolUse` hook (first settings file in this repo).
- Catalog row in `.claude/skills/README.md`; *Use when* line in root `AGENTS.md`.

## Delivery log

| Phase | Record |
|---|---|
| Initiation | Surveyed all 13 skills in `.claude/skills/` for review checklists and severity scales, the deterministic rules in `AGENTS.md` (do-not-touch, two-copy contracts, verify commands), the CI workflows, and the absence of any hooks. Recorded in the research plan. |
| Planning | `docs/research/pr-self-review-skill-plan.md` (routing table, gates R1–R13, severity mapping, traps); decisions Q1–Q9 agreed with the user on 2026-09-20; scope extended with §12 items 1–7. |
| Implementation | Skill v1.0.0: `SKILL.md`, four `references/`, five scripts, `evals/evals.json`, `README.md`, `CHANGELOG.md`. `.claude/settings.json` with the `PreToolUse` hook (first settings file here). Catalog row in `.claude/skills/README.md`; *Use when* line in `AGENTS.md`. |
| Validation | skill-creator `quick_validate`: valid (description 1017 chars, under the 1024 limit). Scripts exercised against the real `lesson-02` tree: `collect.sh` 168 files / 5 959 added lines in 0.45s; `route.sh` groups them (110 ui, 58 rules-only) and routes synthetic backend paths to the right skills; `gates.sh --skip-tests` runs in 8s and reports one HIGH (R12). Synthetic fixtures fire R3, R4, R5, R6, R7 (all four CRITICAL variants), R8, R10 and R11, and leave a valid i18n key alone. Marker flow verified: PASS allows, any edit re-blocks. The hook matcher has its own test table (`scripts/match-publish-command.py`) after two false-block bugs — see root `INSIGHTS.md`. Eval benchmark: run on 2026-09-21 (below). |
| Validation — eval benchmark | Eight cases, each a scratch clone of `lesson-02` with `origin/main` pinned to HEAD so the change set is exactly one seeded edit, `node_modules` symlinked so the typecheck/test gates really run. Cases 1-7 ran twice, with the skill and with no skill (the control); case 8 (hook mechanics) is deterministic and driven by a script. **Assertion pass rate 97% with the skill vs 63% without**; median run 217s / 63k tokens with, 141s / 60k without. Every verdict landed as specified: PASS on the two over-blocking controls (2, 7), BLOCK on 3, 4, 5, 6, PASS on 1, and block -> allow -> block on 8. Without the skill the same diffs got BLOCK on five of seven, including both controls — the baseline has no severity ceiling, so "there are things to say" became "don't push". The run exposed two real defects, fixed in v1.1.0: `collect.sh` aborted on any change set with no untracked files, and R11 (i18n) matched 10 of the 312 `t(` call sites. |
| Hardening (v1.2.0) | The two dead gates in v1.1.0 were symptoms, so this round went after what let them ship. All gate regexes moved to `scripts/patterns.sh`; `scripts/self-test.sh` asserts **reach** (how many lines of the real tree each pattern matches, with a floor) plus a **fire/silent fixture table** — 40 assertions. Run against the v1.0.0 patterns it produces 11 failures, i.e. it would have caught both earlier bugs. It caught a third immediately: R8 matched 3 of 10 real credential formats, missing `sk-proj-` (OpenAI), `sk-ant-api03-` (Anthropic) and `github_pat_` — the two providers this repo calls. Also fixed: `collect.sh` now publishes `work/base.txt` so R3/R5 stop recomputing their own base; R7's repository exemption filters by path rather than by the word appearing anywhere in `path:line:content`; R7's module list is read off disk and `../../modules/<name>/` is matched. Decision Q10: two marker tiers — `gates` (~12s) opens `git push`, `full` is required for `gh pr create`/`merge`/`ready`, because one verdict meant 4-6 minutes before every push, the exact failure `gates.sh` warns about in its own header. |
| Validation — iteration 2 | **22/22 assertions.** Eval 1 re-seeded (the old seed duplicated the shared `run-cost-badge`, so it was never the clean control it claimed): now PASS, 0 CRITICAL, 0 HIGH, and R11 resolved `t("runCost.total", …)` through `useTranslations("prReview")` — the double-quoted, argument-carrying, namespace-relative form v1.0.0 could not see at all. Eval 8 extended to seven tier assertions, all passing. New eval 9 (`--accept`) and eval 10 (`--gates`) cover mechanics no previous run had touched: the override carries the user's reason verbatim into the marker and the PR description and keeps the finding visible rather than deleting it; the gates-only run finished in **49s against 217s** for a full review, wrote `tier: "gates"`, ran no routed review and said so. Regression on five seeded clones: identical to pre-refactor. One bug was introduced and caught during this round — see the `${BASH_SOURCE[0]}` entry in the root `INSIGHTS.md`. |
| Completion | Skill at v1.2.0; eval suite at 10 cases / 44 assertions. Git `pre-push` hook enabled for this clone (`git config core.hooksPath .claude/skills/pr-self-review/scripts`). Insights recorded; commits pending. |

## Addendum — 2026-09-21: manual-only

The `PreToolUse` hook (`.claude/settings.json`) and the git `pre-push` hook (`core.hooksPath`) are switched off; the skill is invoked by hand. Reason: the L02 grading criterion 21 requires the auto-trigger on `git push` to be off, and the manual run on a mixed client+server diff to load both skill sets. Q1/Q2 above describe the previous design. The scripts stay in the repo; re-enabling is two steps (see `SKILL.md`). See `specs/skills-lab-completion.md` L9.
