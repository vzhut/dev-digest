---
name: pr-self-review
description: "Reviews all open local changes against this repo's own skills and returns a PASS/BLOCK verdict before anything reaches GitHub. Use it whenever the user is about to push, open, update or merge a pull request, asks 'is this ready to push?', 'can I open the PR?', 'review my changes', 'check my diff', or wants a pre-PR / pre-commit / pre-merge check — and always when a `git push`, `gh pr create` or `gh pr merge` was just blocked with a 'pr-self-review' message. It routes each changed file to the matching project skills (frontend-architecture, react-best-practices, next-best-practices, react-testing-library for client files; onion-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design for server files; zod, typescript-expert, security across both), runs deterministic gates (typecheck, unit tests, migrations, lockfiles, shared contracts, i18n keys, secrets), and blocks the push when anything CRITICAL is found. Not for reviewing an already-open PR on GitHub or someone else's code."
metadata:
  version: 1.2.2
  updated: 2026-09-24
  stack: node@22, pnpm@10, git, bash@3.2
---

# PR Self-Review

One job: **decide whether the work sitting in this working tree is safe to publish**, using the
skills this repo already has, and say so with a verdict a hook can act on.

The point isn't to produce more review text. It's to stop the handful of mistakes that are
cheap to catch locally and expensive after a PR is open: a broken typecheck, a hand-edited
migration, a contract renamed in one of two copies, an i18n key that doesn't exist, a secret.
Everything else is reported and left to the author's judgement.

**Verdict rule: one CRITICAL finding means BLOCK. Nothing else blocks.** That line is what
keeps the gate trustworthy — if it fires on taste, people route around it and it protects
nothing.

## Invocation

```
/pr-self-review                      # full review, against the merge base with main
/pr-self-review --gates              # deterministic gates only (~12s), writes a `gates` marker
/pr-self-review --base <ref>         # different base
/pr-self-review --full               # also run .it tests (needs Docker) and e2e
/pr-self-review --accept <id> "why"  # record a finding as a false positive and re-verdict
/pr-self-review --quiet              # verdict + CRITICAL only (what the hooks use)
```

It is **manual-only**: nothing in this repo runs it automatically. The `PreToolUse` hook and the git
`pre-push` hook that used to gate `git push` / `gh pr create` / `gh pr merge` are switched off (the hook
registration is gone from `.claude/settings.json`, `core.hooksPath` is unset). The scripts stay in
`scripts/` — to re-enable the gate, restore the `PreToolUse` entry and run
`git config core.hooksPath .claude/skills/pr-self-review/scripts`. Run the skill before publishing work.

## Tiers

A marker records which half of the review produced it, and each command asks for the tier it
deserves:

| Tier | What ran | Cost | Opens |
|---|---|---|---|
| `gates` | R1–R13 only — typecheck, unit tests, and the deterministic rules | ~12s | `git push` |
| `full` | the gates **plus** the routed skill review of every added line | minutes | `gh pr create` · `gh pr merge` · `gh pr ready` |

A `full` marker satisfies both, and a marker written before tiers existed is read as `full`.

The split exists because one verdict for everything made the gate too slow to survive. Pushing
a branch is cheap and reversible and we want people doing it often; handing the work to
someone else is the moment worth waiting for. `gates.sh` states the principle it was breaking:
*a gate people wait on is a gate they learn to bypass*.

When you run `--gates`, say plainly in the report that the skill review has not run yet and
that the PR commands are still closed — a fast PASS must not read like a full one.

## Workflow

Run these in order. Steps 1–2 are scripts; step 3 is the part that needs judgement.

### 1. Collect the change set

```bash
bash .claude/skills/pr-self-review/scripts/collect.sh          # add --base <ref> if given
```

Prints `base`, `head`, `fingerprint`, counts, and writes `.git/pr-self-review/work/`:
`files.txt`, `diff.patch`, `added-lines.txt`.

Two things matter here and both are easy to get wrong by hand:

- **Untracked files count.** `git diff` can't see them, so a brand-new folder would otherwise
  sail through unreviewed. The script includes them.
- **Only added lines are reviewable.** `added-lines.txt` is the whole surface of the review.
  This repo carries known, documented debt (`onion-architecture` §8 D1–D9, `frontend-architecture`
  "Known debt"); a change is not answerable for code it didn't touch, and a gate that flags the
  neighbourhood blocks every branch that goes near it.

If there is nothing to review, say so and stop — don't invent findings for an empty diff.

### 2. Run the deterministic gates

```bash
bash .claude/skills/pr-self-review/scripts/gates.sh            # add --full if given
```

Rules R1–R13, in `scripts/gates.sh` with a comment each: typecheck and unit tests of the
touched packages, migrations, lockfiles, the two `@devdigest/shared` copies, prompt docs,
the onion greps on added lines, secrets, linter configs, the module registry, i18n keys,
missing tests, spec drift. Findings land in `.git/pr-self-review/work/gate-findings.tsv` as
`SEVERITY<TAB>rule<TAB>location<TAB>message`.

A failing typecheck or test suite already means BLOCK, but keep going anyway: handing back
one error when there are also three architecture problems just buys another round trip.

**With `--gates`, stop here.** Report the gate findings, write the marker with
`"tier": "gates"`, and say in one line that the skill review has not run and `gh pr create`
is still closed. Then stop — don't drift into step 3 because the diff looks small.

### 3. Review the added lines against the routed skills

```bash
bash .claude/skills/pr-self-review/scripts/route.sh            # <group> <path> <skills>
```

Read `references/routing.md` once if a routing decision looks odd — it explains each row.

**How to run the review:**

- **Small change** (under ~150 added lines, or a single group): do it inline. Read the SKILL.md
  of each routed skill you haven't already read, then the hunks, then write findings.
- **Larger change**: spawn one sub-agent per non-empty group — `ui`, `backend`, `security` —
  in a single message so they run in parallel. Give each the brief in
  `references/reviewer-prompt.md`, its own file list, and nothing else. They return JSON; you
  merge it. Reviewers with one rubric and one slice of the diff stay far more accurate than one
  agent holding eleven rubrics at once.

**What a finding must have**, or it gets dropped before it reaches the report:

| Field | Rule |
|---|---|
| `file:line` | must be a line present in `added-lines.txt` |
| `skill` / `rule` | the skill and the specific rule it comes from, so the author can check the source |
| `why` | what actually goes wrong — a failure, not a preference |
| `fix` | concrete, and applicable to this code |

This is the guard against the failure mode that kills gates like this one: a confident,
invented CRITICAL that blocks a good push. When you can't name the rule or the consequence,
it isn't a finding — at most it's a note.

**Incremental re-runs.** After a fix, `collect.sh` reports a new fingerprint. Reuse findings
from the previous run for files whose content is unchanged (`git hash-object <file>` matches
what `work/reviewed.json` recorded) and re-review only what moved. The gates always re-run —
they're seconds, and they're the part that catches the fix that broke something else.

### 4. Assign severity and the verdict

`references/severity.md` has the shared scale and how each skill's own labels map onto it.
Two things worth holding in mind while merging:

- `react-best-practices` marks over-engineering and component design CRITICAL. In its own
  context that's fair; here CRITICAL means *blocks a push*, so those land at MEDIUM. Only
  bug-class rules (hooks called conditionally, missing/index keys on reordered lists, state
  derived-then-stored that goes stale) keep CRITICAL.
- A **new** architecture violation is HIGH, not CRITICAL — it's warned about loudly and the
  push proceeds. The four exceptions (config leak, adapter importing `modules/`, impurity in
  `reviewer-core`, unregistered module) are CRITICAL because they break at runtime or invert
  the dependency rule outright.

Drop anything listed in `references/accepted.md` whose expiry hasn't passed.

Verdict: `BLOCK` if any CRITICAL survives, otherwise `PASS`.

### 5. Report, and write the marker

Print the report (`--quiet`: verdict plus CRITICAL only):

```
pr-self-review: BLOCK — 1 critical, 3 high, 2 medium   (47 files, 612 added lines, 38s)

CRITICAL
  [c1a4] client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailView/PrDetailView.tsx:88
         security / OWASP A03 injection — PR body rendered through dangerouslySetInnerHTML;
         a PR title from any contributor executes script in the reviewer's session.
         Fix: render through react-markdown as the rest of the app does.

HIGH
  [h7b2] server/src/modules/pulls/routes.ts:120
         onion-architecture §3 — new Drizzle query in a route handler.
         Fix: move it to pulls/repository.ts and call it from the service.
  …

Gates: typecheck ok · unit tests ok · migrations ok · contracts ok · i18n ok · secrets ok
Next: fix the CRITICAL above, then re-run /pr-self-review.
```

Then write `.git/pr-self-review/<fingerprint>.json` — `tier` is `"gates"` if you stopped
after step 2, `"full"` if you did the skill review:

```json
{ "verdict": "PASS", "tier": "full", "base": "<sha>", "head": "<sha>", "fingerprint": "<fp>",
  "counts": { "critical": 0, "high": 3, "medium": 2, "low": 1 },
  "accepted": [{ "id": "c1a4", "reason": "…", "at": "2026-09-20T10:04:00Z" }],
  "created_at": "2026-09-20T10:04:00Z", "skill_version": "1.2.0" }
```

`tier` is `"gates"` for a `--gates` run and `"full"` otherwise. Write it always; a marker
without it is treated as `full` for backwards compatibility, which is the generous reading.

Only a `PASS` marker opens the hook. Finding ids are short and stable (first 4 hex of a hash
over rule + file + line content) so `--accept` can name one.

### 6. On PASS, offer the PR description

Draft it from what you already know — changed areas, gates that ran, remaining HIGH findings,
and every accepted finding with its reason. Accepted overrides belong in the PR body: a
decision someone made alone at 1am is exactly the thing a reviewer should see.

Don't run `gh pr create` unless the user asks for it.

## Handling `--accept`

Record the id and reason in the marker, re-verdict without that finding, and append a row to
`references/accepted.md` when the same finding has now been accepted more than once. A repeat
is a signal about the *source skill*, not about the author: say so, and offer to fix the rule
that keeps misfiring. A gate that learns is one people keep; one that argues the same wrong
point every week gets bypassed.

## Boundaries

- **Not** the built-in `code-review` skill. That one reads changes against the repo's standards
  *and* the originating spec, on demand, in depth. This one routes project skills, runs the
  deterministic gates and produces a verdict a hook can enforce. If the user wants a thorough
  read rather than a gate, hand them `code-review`.
- **Doesn't fix anything.** Report, then let the author decide. An auto-fix inside a gate makes
  the diff differ from the one that was reviewed.
- **Can't stop a merge on GitHub.** It gates push, PR creation and `gh pr merge` from this
  machine. A required check on the PR is a CI job — lesson L06.
- **Doesn't review** `server/clones/`, `e2e/test-results/`, binaries, or generated migration
  SQL (rule R3 covers those instead).

## Files

| Path | What it's for |
|---|---|
| `scripts/collect.sh` | change set + fingerprint; writes `work/` |
| `scripts/route.sh` | file → group + skills (bash 3.2 compatible) |
| `scripts/gates.sh` | R1–R13, the no-LLM rules |
| `scripts/check-marker.sh` | the gate used by both hooks (`--hook` for Claude Code, `--require full`) |
| `scripts/patterns.sh` | every gate regex, in one place so it can be tested |
| `scripts/self-test.sh` | asserts each pattern's reach on the real tree + a fire/silent table |
| `scripts/match-publish-command.py` | is this Bash call publishing, and at which tier |
| `scripts/pre-push` | git hook; enable with `git config core.hooksPath .claude/skills/pr-self-review/scripts` |
| `references/routing.md` | why each file pattern maps to those skills |
| `references/severity.md` | the shared scale + per-skill mapping |
| `references/reviewer-prompt.md` | the brief for a reviewer sub-agent + its JSON shape |
| `references/accepted.md` | accepted false positives, with expiry |

## Versioning

`metadata.version` is SemVer; history in `CHANGELOG.md`. MAJOR — a change that flips a verdict
(a rule moving to or from CRITICAL) · MINOR — a new rule or routing row · PATCH — wording.

Changing a pattern in `scripts/patterns.sh` means updating `scripts/self-test.sh` in the same
commit. A gate whose regex has drifted away from the codebase's style reports everything as
clean, which is the most expensive way for this skill to fail — it has happened twice.
Bump `version` and `updated` in the same commit, and re-check the rules when a routed skill
changes its own severity scale.
