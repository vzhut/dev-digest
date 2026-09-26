# DevDigest — insights

Cross-package findings that cost real debugging time. Append new entries; don't rewrite old ones.
Package-specific findings belong in that package's `INSIGHTS.md`.

## What Works

_No entries yet._

## What Doesn't Work

### Eval prompts that extend already-clean code don't show whether a skill works

`.claude/skills/onion-architecture/evals/evals.json` · 2026-09-19

The first skill-creator eval loop for `onion-architecture` scored 100% with the skill and 100% without it (21/21 assertions each). The runs without the skill still put Drizzle in a repository, took the GitHub token through `SecretsProvider`, and threw `NotFoundError`. Two things steered them there. `AGENTS.md` / `server/AGENTS.md` already state the DI, secrets and Zod rules. The `repos` module the prompt extended is already split into route, service and repository, so the agent copies the precedent in front of it. The skill only made a visible difference in things the assertions didn't check: unit tests for pure mappers, reusing `countBlockers`, and leaving known deviations alone.

To measure an architecture skill, write prompts that extend code with a **bad** precedent, such as adding an endpoint to `server/src/modules/pulls/routes.ts`, where handlers query `container.db` inline. Assert on what the agent does differently from its surroundings, not on what it would copy anyway.

### A grep-based gate written for one quoting style can be dead on arrival

`.claude/skills/pr-self-review/scripts/gates.sh:139` · 2026-09-21

`pr-self-review`'s R11 gate is meant to be the CRITICAL that stops a missing i18n key from
rendering raw in the UI. Its pattern was `t\('[a-zA-Z]+\.[a-zA-Z0-9_.]+'\)` — single quotes,
no arguments. `client/src` has 302 double-quoted `t("…")` calls, 32 with arguments and 10 in
the matched form, so the gate covered 3% of call sites and passed everything. It was reported
as "verified" because the synthetic fixture used to test it was written in the same style as
the pattern.

Widening the quotes alone would have made it worse. next-intl keys are relative to the
enclosing `useTranslations("<ns>")`, so `t("finding.accept")` in a component scoped to
`prReview` means `prReview.json → finding → accept`. Treating the key's first segment as the
namespace — which the original did — reports a CRITICAL for nearly every correct key in the
repo. The rewrite resolves the namespace from the nearest scope at or above the call line.

Two checks before trusting a grep gate: count how many real call sites the pattern matches
(`grep -rhoE 'pattern' src | wc -l` against the whole package, not a fixture), and run it over
every existing call site to prove it is silent on code that is already correct.

Follow-up, 2026-09-21: acted on. The regexes now live in `.claude/skills/pr-self-review/scripts/patterns.sh`
and `scripts/self-test.sh` asserts two things per pattern — its **reach** on the real tree, with
a floor, and a **fire/silent fixture table**. Run against the v1.0.0 patterns the harness
produces 11 failures, including this R11 bug and an R8 secret pattern that matched 3 of 10 real
credential formats (it missed `sk-proj-`, `sk-ant-api03-` and `github_pat_` — the two providers
this repo actually calls). Reach is the assertion that matters: a fixture written in the same
style as the pattern will always agree with it.

## Codebase Patterns

### `@devdigest/shared` is two hand-synced copies, and the client copy has drifted

`client/tsconfig.json:24` · `reviewer-core/tsconfig.json:22` · 2026-09-17

`diff -r server/src/vendor/shared client/src/vendor/shared` is not empty: the client copy lacks the `'openrouter'` provider id, the `commitFiles` / `findOpenPr` / `sync` / `diffNameOnly` adapter methods, and parts of `contracts/eval-ci.ts`, `knowledge.ts`, `productionize.ts` and `trace.ts`.

The name suggests one shared package, but each tsconfig points `@devdigest/shared` at its own folder. `server/` and `reviewer-core/` resolve to `server/src/vendor/shared/` (the canonical copy), while `client/` resolves to `client/src/vendor/shared/`. Nothing syncs them, so a contract change in the server type-checks cleanly while the client keeps the old shape.

Mirror every contract edit into both folders by hand. Don't copy whole files over to "fix" the drift: the missing pieces are lesson-era features the client doesn't use yet.


## Tool & Library Notes

### Claude Code ignores `AGENTS.md`, so every `CLAUDE.md` is just an `@AGENTS.md` import

`AGENTS.md:3` · `CLAUDE.md:1` · 2026-09-19

`AGENTS.md` (root + one per package) is the single agent guide: Codex, Cursor, Copilot's coding agent, Windsurf and Zed load it natively, nearest file wins. Claude Code does not read `AGENTS.md`, only `CLAUDE.md`, so each `CLAUDE.md` holds just `@AGENTS.md` (Claude's import syntax). An import was chosen over a symlink because symlinks check out as plain text files on Windows without `core.symlinks`.

Edit `AGENTS.md`. Anything written into a `CLAUDE.md` is seen by Claude only and drifts from the other tools. `.github/copilot-instructions.md` repeats a few essentials on purpose, because Copilot Chat on github.com follows no imports. Update it when verify commands or do-not-touch paths change.

### The documented `.cursor/skills` symlink doesn't exist

`.claude/skills/README.md:3` · `git ls-files | grep -i cursor` → empty · 2026-09-19

The skills README says `.cursor/skills/ → ../.claude/skills` gives Cursor the same skills, but no `.cursor/` directory is committed. Cursor sees no project skills, only the pointer in `AGENTS.md` telling agents to read `.claude/skills/*/SKILL.md` as plain docs. Not fixed: either commit the symlink (with the same Windows caveat as above) or correct the README.

### `react-best-practices` prescribes a stack the client doesn't use

`.claude/skills/react-best-practices/SKILL.md` (Tailwind, Axios, Data Fetching, Performance sections) · 2026-09-19

The skill tells agents to use Tailwind utility classes with no inline `style={}`, an Axios instance with interceptors, `useApiQuery`/`useApiMutation` core hooks, `react-error-boundary`, Vite `manualChunks` and `React.lazy` routes. None of these exist in `client/`: styling is a per-component `styles.ts` exporting `s` (Tailwind v4 is installed via `client/postcss.config.mjs` but has ~31 `className` uses), HTTP is `fetch` in `client/src/lib/api.ts`, data hooks are plain TanStack Query in `client/src/lib/hooks/<domain>.ts`, and the app is Next.js, not Vite.

An agent that follows the skill literally rewrites styles to Tailwind or adds Axios. Where the two disagree, follow `AGENTS.md` and the `frontend-architecture` skill; treat those sections of `react-best-practices` as not applicable until the skill is aligned (tracked in `client/docs/improvement-plan.md`, "The skills themselves").

### Multi-flag variables don't word-split in the Bash tool's zsh, so `grep` checks return nothing

2026-09-19

The shell behind the agent's Bash tool here is zsh. `S="--include=*.ts --include=*.tsx"; grep -rn foo $S app` passes the whole string as **one** argument, so `grep` looks for a file literally named that, finds nothing and prints nothing. A codebase audit built this way reports every check as clean. The same session hit a second silent no-op: macOS BSD `sed` treats `\?` in `sed 's/\.tsx\?$//'` literally, so the substitution never matched.

Run multi-step shell audits under `bash <<'EOF' … EOF` (bash word-splits unquoted variables), or pass flags inline. On macOS use `sed -E` with `?`, or `${var%.tsx}` parameter expansion. Sanity-check that a "no findings" grep can find a known hit before trusting it.

### skill-creator rejects a SKILL.md `description` over 1024 characters

`.claude/skills/onion-architecture/SKILL.md:3` · 2026-09-19

`python -m scripts.quick_validate <skill-dir>` fails with `Description is too long (1042 characters). Maximum is 1024 characters.` The limit is the Agent Skills frontmatter limit. skill-creator's advice to make descriptions "pushy", with trigger phrases and exclusions, pushes them right up against it. `onion-architecture` ended at 1022 and `frontend-architecture` is at 872. Trim the neighbour-skill exclusions first; they are the least useful for triggering. The validator also needs PyYAML, which isn't installed in the pyenv Python here (`ModuleNotFoundError: No module named 'yaml'`). Run it from a throwaway venv: `python3 -m venv v && v/bin/pip install pyyaml`.

### A `PreToolUse` Bash hook must match an invocation, not the words anywhere in the command

`.claude/skills/pr-self-review/scripts/match-publish-command.py:24` · 2026-09-20

The `pr-self-review` gate blocks Bash calls that publish work. Both naive matchers failed on
their very first real call, and both failures looked like a verdict rather than a bug: the hook
printed "these changes have not been reviewed yet" for an edit that touched no code at all.

A substring match (`case "$cmd" in *"git push"*`) fired on a heredoc writing a documentation
line that contained the words. Anchoring on shell separators fixed that, then fired on an
INSIGHTS.md entry quoting the example `git add . && git push` — the `&&` inside the quoted text
is indistinguishable from a real separator once the command is one flat string.

The hook receives the whole composite command in `tool_input.command`, so heredoc bodies, commit
messages and grep patterns are all part of what gets matched. The fix is to delete the parts
that are data before matching: heredoc bodies, then single- and double-quoted spans, then search
for the invocation at the start of the string or right after a separator. Note `git -C dir push`
and `git --git-dir=.git push` need the global-flag form `git(?:\s+-\S+(?:\s+\S+)?)*\s+push`.

Erring towards letting a command through is the right bias for a gate like this: a missed push
costs one unreviewed change, a false block costs trust in every verdict the skill produces.
The matcher has a test table covering both sides — extend it rather than tweaking the regex blind.

### Under `set -euo pipefail`, a grep that matches nothing kills the script

`.claude/skills/pr-self-review/scripts/collect.sh:52` · 2026-09-21

`collect.sh` computed its fingerprint with
`untracked_files | grep -Ev "$EXCLUDE_RE" | while IFS= read -r f; do …`. `grep` exits 1 when
nothing matches, `pipefail` propagates that as the pipeline's status, and `set -e` then killed
the script — silently, before it printed or wrote anything, with exit code 1 and no output.

The failing case is a change set with **no untracked files at all**: an ordinary branch of
tracked edits, which is most branches. `check-marker.sh` calls
`collect.sh --fingerprint-only`, so it got an empty fingerprint and the gate could never be
satisfied for that change — the PASS marker it wanted could not be named. It went unnoticed
because the `lesson-02` working tree always has untracked files, so every manual test hit the
matching branch.

Wrap any filter whose empty result is legitimate: `cmd | { grep -Ev "$RE" || true; }`. The
sibling `all_files()` already had the `|| true` — the bug was one helper that didn't. When a
`pipefail` script exits non-zero with no output at all, suspect an empty grep before anything
else.

### `${BASH_SOURCE[0]}` must be resolved before the script `cd`s to the repo root

`.claude/skills/pr-self-review/scripts/gates.sh:17` · 2026-09-21

Extracting the gate regexes into a sourced `patterns.sh` introduced a fresh version of the
failure the extraction was meant to prevent. `gates.sh` does `cd "$(git rev-parse
--show-toplevel)"` and only then computes
`HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`. Invoked by a relative path from a
subdirectory — `cd server && bash ../.claude/skills/pr-self-review/scripts/gates.sh` — that
relative path no longer resolves after the `cd`, so the source failed, every pattern variable
was unset, and the script **exited 0**: a gate reporting no findings because it never ran.

`set -u` did print `P_ONION_DB: unbound variable`, but `gates.sh` runs under `set -uo pipefail`
without `-e` on purpose (a finding must not abort the remaining rules), so the unbound variable
killed one pipeline and the script carried on to its `exit 0`.

Resolve `HERE` on the first line after `set`, before any `cd`, and make a failed source fatal:

```bash
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(git rev-parse --show-toplevel)"
. "$HERE/patterns.sh" || { echo "cannot source $HERE/patterns.sh" >&2; exit 67; }
[ -n "${P_ONION_DB:-}" ] || { echo "patterns.sh loaded but empty" >&2; exit 67; }
```

The general rule for anything that gates a publish: a script that cannot do its job must exit
non-zero. Silence has to mean "checked and clean", never "did not run".

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

### 2026-09-21 — pr-self-review eval benchmark

Ran the eight-case eval suite for `pr-self-review`: scratch clone per case with `origin/main`
pinned to HEAD so the change set is exactly one seeded edit, `node_modules` symlinked so the
typecheck and unit-test gates really run, cases 1-7 executed twice (with the skill, and with no
skill as the control), case 8 driven by a script since hook mechanics are deterministic.
Assertion pass rate 97% with the skill against 63% without, and every verdict landed as
specified, including PASS on both over-blocking controls. The instructive half is the control:
without the skill the same diffs got BLOCK on five of seven cases, because there is no severity
ceiling — "there are things to say about this" collapses into "don't push". That is the thing
the skill actually buys, more than finding the defects, which the baseline also found.

The run exposed two real defects in the skill, both recorded above and fixed in v1.1.0. Also
enabled the git `pre-push` hook for this clone:
`git config core.hooksPath .claude/skills/pr-self-review/scripts`.

### pr-self-review knows only four packages, and its R13 check errors on a change with no product code

`.claude/skills/pr-self-review/scripts/gates.sh:69` · `gates.sh:86` · `gates.sh:245-246` · 2026-09-26

Reviewing the new `mcp-server/` package, `gates.sh` passed with no findings although it had **not** typechecked, tested or lock-checked it: the per-package runs (`run_pkg …`, line 69), the lockfile list (line 86) and `route.sh` (every `mcp-server/**` file comes back as `rules-only`) only name `client`, `server`, `reviewer-core` and `e2e`. A clean gate therefore means nothing for a fifth package until it is added there; run that package's own `pnpm typecheck && pnpm test` by hand and read its source against the `security` skill yourself.

Separately, `code_lines=$(grep -cE … "$ADDED" 2>/dev/null || echo 0)` (line 245) yields `0\n0` when nothing matches (`grep -c` prints `0` **and** exits 1, so `|| echo 0` prints a second one), and the next line then fails with `[: 0\n0: integer expression expected`. It is only noise today because the script keeps going, but the R13 spec-drift check is skipped in exactly the case it is meant for (a branch with no `client|server|reviewer-core` src lines). Not fixed here: changing a gate needs `self-test.sh` updated in the same commit.

## Open Questions

### Why does a real review store `confidence: 0` on every finding?

`server/src/vendor/shared/contracts/findings.ts:57` · `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/constants.ts:4` · `GET /repos/bb2312bb-a43b-46ca-8865-a9ac9dd16e43/pulls` (PR #24) · 2026-09-17

All six persisted findings of PR #24's latest review have `confidence: 0`, so the UI shows "0% conf" everywhere. With "Hide low confidence" on (threshold 0.65), every one of them would be hidden. The seeded findings (0.98 / 0.86) are fine, so the UI is not the cause.

Not investigated. The candidates are: the model actually returning 0 (e.g. a provider that doesn't honour the schema), `reviewer-core` dropping or defaulting the field while parsing the output, or the server's `insertFindings` persisting it wrong. The first thing to check is that run's trace (`GET /runs/:id/trace`) for the raw model output.

**Answered 2026-09-17: it's the model, not our pipeline.** Run `bf477bb5-c8f1-41e5-8ae6-739a09cd6c63` (Performance Reviewer, `deepseek/deepseek-v4-flash`): its trace `raw_output` literally contains `"confidence": 0` for all 6 findings, and the pipeline persisted them faithfully. The next Performance Reviewer run on the same PR, same model, returned 0.95 / 0.85. So the model sometimes emits 0 when it fills the required field. `confidence` is `z.number().min(0).max(1)` with no guidance in the prompt, so 0 is schema-valid. Side effect: "Hide low confidence" (threshold 0.65, `FindingsPanel/constants.ts`) hides *every* finding of such a run. Not fixed. Possible options: describe `confidence` in the schema/prompt, or treat an all-zero run as "confidence unknown".
