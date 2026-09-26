# Changelog — pr-self-review

All notable changes to this skill. Versioning per `SKILL.md` → *Versioning*:
MAJOR — a change that flips a verdict · MINOR — a new rule or routing row · PATCH — wording.

## 1.2.2 — 2026-09-24

### R8 flagged `.env.example` as a committed secret file

`P_SECRET_ENVFILE` (`(^|/)\.env($|\.)`) also matches `server/.env.example`, the documentation file that is
meant to be committed, so any change that documented a new variable got a CRITICAL and a BLOCK. The real
`.env` is git-ignored and never reaches the change set. A second pattern, `P_SECRET_ENVFILE_SAFE`
(`.env.example`, `.env.sample`, `.env.template`), is now subtracted; `.env`, `.env.local` and the like still
fire. `self-test.sh` pins both directions. Found while gating the Intent Layer change, first time the file
was touched on a branch since the rule was written.

## 1.2.1 — 2026-09-21

### R11 gave the wrong namespace to files with two translators

The scope regex matched any `useTranslations(...)` regardless of the variable it was assigned to, while
the call regex only matches `t(...)`. A component with `const t = useTranslations("skills.add")` and
`const tType = useTranslations("skills.listItem.type")` had every `t(...)` resolved against the *second*
namespace, so 12 correct keys were reported as missing CRITICALs (`CreateSkillModal.tsx`). The scope now has
to be assigned to `t`; `self-test.sh` has a silent case for `tType`.

## 1.2.0 — 2026-09-21

Follow-up to the 1.1.0 bug fixes: the two dead gates were symptoms, so this release goes after
the thing that let them ship, and after the latency that was making the gate skippable.

### Patterns are testable now

- `scripts/patterns.sh` — every gate regex in one place.
- `scripts/self-test.sh` — 40 assertions of two kinds. **reach**: how many lines of the real
  tree a pattern matches, with a floor, so a pattern that has drifted away from the codebase's
  style fails a test instead of silently passing every diff. **table**: fixture lines each
  pattern must fire on and must stay silent on. Run against the v1.0.0 patterns it produces 11
  failures, including both bugs fixed in 1.1.0.

### R8 was missing the two providers this repo actually calls

`sk-[A-Za-z0-9]{20,}` breaks on the first dash, so `sk-proj-…` (OpenAI), `sk-ant-api03-…`
(Anthropic) and `sk-svcacct-…` all slipped through — as did `github_pat_…`, `gho_…`, `ASIA…`,
Slack `xox[baprs]-…` and Google `AIza…`. It caught 3 of 10 real formats; it now catches 10 of
10 and stays silent on `process.env.OPENAI_API_KEY`, on placeholders and on prose.

### Two tiers, so the gate stops being something to bypass

A marker now records `"tier"`. `gates` (R1–R13 only, ~12s) opens `git push`; `full` (gates plus
the routed skill review) is required for `gh pr create` / `gh pr merge` / `gh pr ready`. A
`full` marker satisfies both, and a marker without the field is read as `full`.
`match-publish-command.py` now prints the tier a command needs instead of a bare yes/no.

One verdict for everything meant four to six minutes before every push, which is exactly the
failure `gates.sh` warns about in its own header. A branch push is cheap and reversible;
handing work to someone else is the part worth waiting for.

### Also

- `collect.sh` writes `work/base.txt`, and `gates.sh` reads it. R3 and R5 used to recompute
  their own base with `git merge-base HEAD main` while `collect.sh` prefers `origin/main`, so
  on any clone with a stale local `main` the two halves disagreed about what the change was.
- R7's repository exemption filters by **path**, not by the word appearing anywhere in
  `path:line:content` — the old form silently excused any route-handler line that happened to
  contain "repository".
- R7's cross-module list is read off `server/src/modules/` instead of being hard-coded, so a
  module added by a later lesson is not exempt by default; `../../modules/<name>/` is matched
  alongside `../<name>/`.
- Eval suite: 10 cases, 44 assertions. Case 1's seed no longer duplicates the existing shared
  `run-cost-badge` (it was not the clean control it claimed to be); cases 3 and 7 gained
  assertions the no-skill baseline fails; new cases cover `--accept` and a `--gates` run.

## 1.1.0 — 2026-09-21

Both fixes come from the first eval benchmark run (8 cases, with-skill vs no-skill).

- **`collect.sh` aborted on any change set with no untracked files.** Inside `fingerprint()`,
  `untracked_files | grep -Ev "$EXCLUDE_RE" | while …` runs under `set -euo pipefail`, and a
  grep that matches nothing exits 1 — so a plain branch of tracked edits, the common case,
  killed the script before it printed or wrote anything. `check-marker.sh` then never got a
  fingerprint, so the gate could not be satisfied at all. It never showed on `lesson-02`
  because that tree always has untracked files. Fixed with a shared `untracked_reviewable`
  helper that swallows the empty-match exit code.
- **R11 (i18n keys) saw almost nothing and resolved keys wrongly.** Its grep matched only
  single-quoted, argument-less `t('a.b')` — 10 of the 312 `t(` call sites in `client/src`.
  It also treated the key's first segment as the namespace, although next-intl keys are
  relative to the enclosing `useTranslations("<ns>")`, so simply widening the quotes would
  have reported a CRITICAL for nearly every correct key. Rewritten in Python: it resolves the
  namespace from the nearest scope above the call, handles both quote styles and calls with
  arguments. Verified silent across all 444 real call sites and firing on a genuinely missing
  key, a missing namespace, and the old single-quoted form.

MINOR rather than MAJOR: no rule moved to or from CRITICAL — R11 was already CRITICAL and is
now merely able to fire.

## 1.0.0 — 2026-09-20

Initial version. Spec: `specs/pr-self-review-skill.md`, plan: `docs/research/pr-self-review-skill-plan.md`.

- Change set collection including untracked files, with a fingerprint that binds a verdict to an exact diff.
- Deterministic gates R1–R13 (`scripts/gates.sh`).
- Deterministic routing of changed files to the eleven reviewer-grade project skills (`scripts/route.sh`).
- One severity scale with a per-skill mapping; only CRITICAL blocks.
- `PreToolUse` hook (`.claude/settings.json`) on `git push`, `gh pr create`, `gh pr merge`, `gh pr ready`,
  plus an optional git `pre-push` hook.
- `--accept <id> "reason"` override, carried into the marker and the PR description.
