---
name: run-plan
description: >
  Runs the implementation half of DevDigest's Spec-Driven Development pipeline from an
  already-approved Development Plan: implementer waves (baseline shared once per wave, full
  suite only on the plan's Checkpoint task) -> architecture-reviewer + plan-verifier in parallel
  -> a bounded fix loop on their findings -> optional doc-writer -> Delivery log + handoff to
  /pr-self-review. Does NOT run spec-creator or implementation-planner — both are invoked by hand
  before this skill starts — and does NOT run test-writer (the implementer already writes tests
  alongside its code; a separate pass is redundant full-package work). TRIGGER when the user hands
  you a plan path (`<name>.plan.md` + `<name>.tasks.md`, `Status: ready`) and wants it executed
  through review, or says "implement this plan", "run the plan end to end", "take this plan
  through review". DO NOT TRIGGER before a spec/plan exists, or when only one phase is wanted
  (spawn that agent directly instead).
metadata:
  version: 0.1.0
  updated: 2026-10-01
  stack: Claude Code sub-agents (sonnet-only pipeline)
---

# SDD implement

One job: take an **approved, already-planned** feature through implementation, review and a
bounded fix loop. The spec and the plan are made before this skill runs — by hand, with
`spec-creator` and `implementation-planner` — and this skill never spawns either.

You (the session running this skill) are the **parent** per `.claude/agents/README.md`: the only
one with `AskUserQuestion`, the only one who commits, the only one who writes a spec's/plan's
`## Delivery log`. Read that README once if you haven't this session — it's the map; this file is
the loop around the implementation+review half of it.

## Invocation

```
/run-plan <plan path>               # <name>.plan.md, Status: ready, tasks file alongside
/run-plan <plan path> fix-cap: <n>  # override the default fix-loop cap (3)
```

No plan path, the plan doesn't exist, or its `Status` is `needs decisions`/`incomplete` → stop and
say so; don't start implementing against a plan that still has open decisions — send the user back
to `implementation-planner` instead.

## What this skill deliberately skips (cost)

- **No `spec-creator` / `implementation-planner` calls.** Both run manually, outside this skill.
- **No `test-writer` pass.** The implementer writes tests alongside its code already; running a
  separate full coverage pass on top is the kind of redundant work the Checkpoint convention below
  exists to avoid. A real gap (implementer reports "Untestable", or a fix-loop finding needs a
  missing test) is fixed inline as part of that fix task — same `implementer`, same file — not
  handed to a separate agent.
- **No execution-mode question.** The plan already states it (`Execution mode:` in its header) —
  read it, don't ask.
- **`architecture-reviewer` and `plan-verifier` both run on `sonnet`**, not `opus` — see
  `.claude/agents/README.md` Known limits for the one open risk this created (unverified finding
  quality at `sonnet`; watch the first few runs).

## Phase A — Implement (`implementer`)

1. **Single-agent mode** (plan header says so): one `implementer` call, handed the whole plan
   path; it runs tasks in dependency order itself.
2. **Multi-agent mode:** walk the plan's Execution waves table. Per wave:
   - Run the wave's baseline check yourself once per touched package (the exact commands from
     `AGENTS.md` "Commands — verify"), keep the one-line pass/fail summary.
   - Spawn one `implementer` per task, **in parallel** (one message, multiple `Agent` calls) when
     `Owned paths` are disjoint. Each prompt includes: plan path, task ID, tasks-cards file path,
     the wave's baseline summary (so it skips re-running it), and whether its card is
     `Checkpoint: yes`.
   - A task continuing the same package/area from a prior wave → `SendMessage` to the same
     implementer instance instead of a fresh spawn.
3. `Status: blocked` → batch its `### Questions` to the user via `AskUserQuestion`, resume with
   `SendMessage`. Don't stall independent tasks waiting on an unrelated blocked one.
4. After all waves: `git status`/`git diff --stat` yourself against the plan's declared
   `Owned paths` — flag anything outside them.
5. Delivery-log line on the plan (and the spec it points to): `Phase A (implement) — <date> — <N>
   tasks done, waves: <N>`.

## Phase B — Review (`architecture-reviewer` + `plan-verifier`, parallel, both `sonnet`)

1. Generate the diff `architecture-reviewer` needs (it has no Bash): `git diff --name-status
   <base>...HEAD` + the unified diff, saved to a scratchpad file. Pick `<base>` once (branch point
   / merge-base with `main`) and reuse it for every fix-loop round — the reviewer's "added/changed
   lines only" rule depends on a stable base.
2. One message, both agents: `architecture-reviewer` (diff file + base ref) and `plan-verifier`
   (the plan's spec path — it pulls in the companion `.plan.md`/`.tasks.md` itself). Independent,
   read-only, no need to see each other's output.
3. Delivery-log line: `Phase B (review) — <date> — architecture: CRITICAL <n>/HIGH <n>/MEDIUM
   <n>/LOW <n>; plan-verifier: <verdict>, PASS <n>/PARTIAL <n>/MISSING <n>/UNVERIFIED <n>`.

## Phase C — Fix loop (bounded, default cap 3, override with `fix-cap:`)

**Qualifies for another round:** `architecture-reviewer` CRITICAL/HIGH, or `plan-verifier`
`MISSING`/`PARTIAL`. MEDIUM/LOW and `UNVERIFIED` (Docker/e2e/manual-only) never trigger a round —
collect them for the final report; a retry can't resolve what no agent here can check faster.

**Cap hit with qualifying findings still open:** stop, report what's left and why, let the user
decide (another round, accept as known issue, fix it themselves).

Each round:

1. **Classify before assigning:**
   - `architecture-reviewer` finding, or a `plan-verifier` item whose AC *was* covered by a task
     that just didn't finish right → **fix task** for `implementer`, scoped to that finding's
     file(s) + its test file. A correction within the existing plan's intent.
   - `plan-verifier` `MISSING` because **no task in the plan ever covered that AC** → a planning
     gap, not an implementer slip. Send it back to `implementation-planner` (`SendMessage` to the
     same instance if still live, else a fresh call) to add the missing task(s); run those through
     Phase A before re-reviewing. Don't improvise a task yourself here.
2. **Shape each fix task** like `implementation-planner` does: `Action`, `Owned paths`,
   `Depends-on: none` unless two findings share a file, `Risk` from severity, `Acceptance: finding
   resolved + <package> targeted tests + typecheck pass`. Group same-file findings into one task.
3. **Dispatch:** `SendMessage` to the implementer instance that still owns that file/area if live
   and small; otherwise spawn fresh, scoped to just this fix. Independent fix tasks (disjoint
   files) run in parallel.
4. **Re-review:** regenerate the diff against the *same* base ref; re-spawn **fresh**
   `architecture-reviewer` and `plan-verifier` instances (cheap, read-only — a fresh read avoids
   anchoring on what last round claimed was fixed).
5. Exit on zero qualifying findings, or the cap.

Delivery-log line per round: `Phase C round <k> — <date> — fixed <n>, carried <n>, new <n>`.

## Phase D — Docs (`doc-writer`, optional)

Only if the plan's `## Affected packages & contracts` or the spec implies docs, or the user asks.
Hand it the spec path; it finds the implemented code itself.

## Phase E — Wrap-up

1. Final Delivery-log entry: `Phase E (done) — <date> — <summary>, review: clean | <n> items
   deferred, docs: written | not needed`.
2. Summarize the run in under ~10 lines: mode used, round count, anything deferred.
3. Recommend `/pr-self-review` before publishing. **Never** `git commit`/`push`/open a PR yourself.

## Known limits (unverified — this skill is new)

- No smoke run yet. Phase C step 1's finding→task classification is the riskiest part: it
  improvises task shape from a review finding rather than from a human-approved spec. Check early
  runs' fix tasks before trusting them unattended.
- `architecture-reviewer` and `plan-verifier` on `sonnet` (see `.claude/agents/README.md`): no
  comparison run against `opus` on the same diff yet.
- Supersedes the earlier `sdd-run` skill (removed 2026-10-01), which also drove `spec-creator` and
  `implementation-planner` — split out because those two are run by hand now.
