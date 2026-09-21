# pr-self-review

A local gate. Before anything reaches GitHub, it reviews every open change against the skills
this repo already has and returns **PASS** or **BLOCK**. One CRITICAL finding blocks; nothing
else does.

## Using it

```sh
/pr-self-review                      # full review, against the merge base with main
/pr-self-review --gates              # deterministic gates only, ~12s
/pr-self-review --full               # also .it tests (Docker) and e2e
/pr-self-review --accept c1a4 "the PR body is sanitised upstream"
```

You mostly won't type it. The `PreToolUse` hook in `.claude/settings.json` blocks
`git push`, `gh pr create`, `gh pr merge` and `gh pr ready` until a PASS exists for the exact
current diff, and the agent then runs the review by itself.

Two tiers, because one verdict for everything was too slow to survive. `git push` needs only
the deterministic gates (~12s) — a branch push is cheap and reversible. `gh pr create`,
`gh pr merge` and `gh pr ready` need the full review, because that is where the work stops
being yours alone.

To gate pushes from your own terminal too, once per clone:

```sh
git config core.hooksPath .claude/skills/pr-self-review/scripts
```

`git push --no-verify` skips that one. Deliberately: an unskippable local hook gets uninstalled.

## How it works

1. `scripts/collect.sh` — branch commits + staged + unstaged + **untracked**, fingerprinted.
   Only added lines are reviewable, so the repo's documented debt doesn't block every branch.
2. `scripts/gates.sh` — R1–R13 with no model involved: typecheck, unit tests, migrations,
   lockfiles, the two `@devdigest/shared` copies, prompt docs, onion greps, secrets, linter
   configs, module registry, i18n keys, missing tests, spec drift. Every regex lives in
   `scripts/patterns.sh` and is covered by `scripts/self-test.sh` — run it after touching one.
   A grep gate that has drifted from the codebase's style reports everything as clean, which
   is how R8 and R11 both shipped broken.
3. `scripts/route.sh` — each file to the skills that actually apply to it.
4. The review itself: inline for a small change, three parallel sub-agents (ui · backend ·
   security) for a large one.
5. A marker in `.git/pr-self-review/<fingerprint>.json`. Edit anything and the fingerprint
   changes, so the gate re-opens by itself.

## What it is not

It can't stop someone pressing Merge on GitHub — that needs a required CI check (lesson L06).
It isn't the built-in `code-review` skill either: that one is a deeper, on-demand read including
the spec axis. This one is a gate.

## Changing it

- Rules that don't need judgement belong in `scripts/gates.sh`, one comment each explaining why.
- Routing changes go in `scripts/route.sh` **and** `references/routing.md` — the table is the
  argument, the script is the implementation.
- Moving a rule to or from CRITICAL flips verdicts: that's a MAJOR version bump.
- If the same finding keeps being wrong, fix the skill that raises it rather than muting it in
  `references/accepted.md`.

Spec: `specs/pr-self-review-skill.md` · plan and sources: `docs/research/pr-self-review-skill-plan.md`.
