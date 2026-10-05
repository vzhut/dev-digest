---
name: workflow-retro
description: >
  Manual-only retrospective over a multi-agent/multi-step Claude Code workflow that just ran in
  THIS conversation (run-plan, or a hand-run spec-creator -> implementation-planner -> implementer
  -> architecture-reviewer/plan-verifier chain, or any sequence of two or more subagent spawns).
  Reports which agents ran, in what order, how many tokens/tool-uses/duration each cost, what went
  easily, what was hard, what got duplicated across agents, what got missed or caught late — plus
  concrete improvement proposals, not just numbers. Posts a summary to chat and appends one entry
  to docs/retro/ledger.md. TRIGGER only on an explicit ask: the user invokes it by name
  (`/workflow-retro`, `/workflow-retro deep`), or says things like "retro this workflow", "how did
  that run go", "review the agent run". DO NOT TRIGGER automatically just because a multi-agent
  workflow finished — not after run-plan's Phase E, not after any chain of subagent spawns, not
  from this description matching the moment a workflow ends. Wait for an explicit request, every
  single time, no exceptions, until the user says otherwise.
metadata:
  version: 0.1.0
  updated: 2026-10-01
  stack: Claude Code sub-agents
---

# Workflow Retro

One job: turn a just-finished multi-agent run into **evidence about the agents and the workflow
itself** — not about the code they produced. `engineering-insights` captures what a session
learned about the codebase; this skill captures what the *orchestration* cost and where it
rubbed.

**This skill never self-triggers.** Re-read the `description` above before acting: it fires only
on an explicit, current-turn request. A multi-agent workflow finishing in this same conversation
is not, by itself, a reason to invoke this skill.

## Invocation

```
/workflow-retro           # in-context analysis only
/workflow-retro deep      # also mines repo artifacts left behind by the agents (see below)
```

Works on the workflow that ran **in this conversation**, from the first `Agent`/`SendMessage`
call the session can still see up to now. No multi-agent activity in context → say so and stop;
don't invent a retro for a single-agent task.

## Data sources

### Default — in context only

Everything already visible in this conversation, no extra reads:

- Each subagent's `task-notification` — it carries `<usage><subagent_tokens>…</subagent_tokens>
  <tool_uses>…</tool_uses><duration_ms>…</duration_ms></usage>`. This is the token/cost source —
  real numbers from the harness, never estimated.
- The order of `Agent` calls and `SendMessage` continuations in this conversation (chronological).
- Each agent's hand-back report text (`Status:`, `### Questions`, findings tables, DoD) as already
  printed in chat.
- Any `AskUserQuestion` round-trips this session did on the agents' behalf (a blocked agent's
  question relayed to the user).

### `deep` — repo artifacts, not raw transcripts

**Never** `Read` or `tail` a subagent's `output_file` path from its launch result — that file is
the subagent's full untrimmed JSONL transcript; reading it defeats the purpose of forking and can
overflow this session's context on its own. `deep` mode does not need it. Instead it reads what the
agents actually left on disk:

- `git log --oneline <range>` and `git diff --stat <range>` for the commits/files touched during
  the workflow, to see if the footprint matches what agents reported.
- The spec's/plan's `## Delivery log` entries written during this run (phase-by-phase evidence
  `run-plan` or the parent already recorded).
- The diff of each touched `INSIGHTS.md` for this session (what got recorded vs. what the retro
  independently notices was missed).
- Full findings tables from `architecture-reviewer`/`plan-verifier`/fix-loop rounds, already in
  chat — read in full rather than the chat-truncated summary if the parent kept them in a
  scratchpad file.

If an artifact `deep` wants isn't available (no git range, no Delivery log), note it as
unavailable and fall back to default-mode evidence for that point — don't guess.

## What to produce

Four things, every run. A retro with only the table is incomplete.

1. **Agent table** — one row per agent spawn (a `SendMessage` continuation of a live agent is the
   *same* row, tokens/duration summed, not a new row): name, model (if stated in the agent's
   definition or report), tokens, tool uses, duration, order, final status.
2. **Totals** — agent count, total tokens, wall-clock time for the workflow (not the sum of agent
   durations — parallel waves overlap; note both so parallel efficiency is visible).
3. **Insights**, each with evidence, under four headings:
   - **Went easily** — `Status: done` on the first pass, no fix-loop round touched its files.
   - **Had difficulty** — `Status: blocked`, a `### Questions` round-trip, or a fix-loop round
     that had to touch the same agent's output more than once. Name the friction, not just that
     friction happened.
   - **Duplicated** — the same fact gathered or re-stated by two or more agents (e.g. two agents
     both re-derive a file's purpose the parent already knew; two reviewers flag the same line).
   - **Missed / caught late** — a `plan-verifier` `MISSING`/`PARTIAL` on something an earlier
     agent's own Definition of Done had marked satisfied; an `architecture-reviewer` finding on
     code an implementer had already called done.
4. **Proposals** — not optional. At least one concrete, evidence-backed suggestion for next time:
   a task card that should have been split differently, a skill preloaded but never applied
   (per an implementer's "skills applied" line), a model that over/under-delivered for its cost, a
   step that could run in parallel but ran serially, a question that could have had a recommended
   default so the agent didn't have to block on it. Each proposal names the evidence it's based on
   and is phrased as a testable change ("next run, do X") — not a vague "could be more efficient."
   Zero proposals is a red flag that the retro didn't look hard enough, not a valid outcome.

## Output — both, every run

1. **Chat** — a short summary (~15–20 lines): totals line, the agent table, the four insight
   headings condensed to one line each where there's nothing notable, and the proposals in full
   (these are the point of the exercise — don't compress them away).
2. **Ledger file** — append one entry to `docs/retro/ledger.md` (create the file with the header
   below if it doesn't exist yet). This is a single, consolidated, cross-package ledger — unlike
   `engineering-insights`, retro entries are about the orchestration, not about one package's code,
   so they never get routed into a package's `INSIGHTS.md`.

### Ledger entry format

````markdown
### <workflow name / spec or plan it covers> — <date>

Mode: default | deep · Agents: N · Total tokens: ~T · Wall time: ~Xm · Fix-loop rounds: R (if any)

| # | Agent | Model | Tokens | Tool uses | Duration | Status |
|---|---|---|---|---|---|---|
| 1 | spec-creator | opus | 45k | 12 | 3m10s | done |
| 2 | implementer T1 | sonnet | 30k | 18 | 2m05s | done |

**Went easily:** …
**Had difficulty:** …
**Duplicated:** …
**Missed / caught late:** …

**Proposals:**
- …
````

Rules, same as `engineering-insights`: **append only**, never rewrite or delete a prior entry; get
the date from `date +%F`; cite evidence (`path:line`, a status string, a token count) for every
claim, not vague impressions.

If `docs/retro/ledger.md` doesn't exist yet, create it with:

```markdown
# Workflow retro ledger

Manual-only retrospectives over multi-agent Claude Code workflows — cost, order, friction and
proposals for the orchestration itself, not the code it produced. Run by hand: `/workflow-retro`
(in-context) or `/workflow-retro deep` (also mines git log, Delivery log entries and INSIGHTS.md
diffs from the run). Append only. See `.claude/skills/workflow-retro/SKILL.md`.
```

## Workflow

```
- [ ] 1. Confirm this was an explicit request, not an inferred one (re-check the trigger rule)
- [ ] 2. Walk this conversation's Agent/SendMessage calls and task-notifications; build the agent table
- [ ] 3. deep only: pull git log/diff --stat, Delivery log entries, INSIGHTS.md diffs for the range
- [ ] 4. Fill the four insight headings with evidence; leave a heading terse if there's truly nothing
- [ ] 5. Write at least one proposal per retro; more if the evidence supports it
- [ ] 6. Append the ledger entry (create docs/retro/ledger.md header if missing)
- [ ] 7. Post the chat summary
```

## Promoting a recurring proposal

A proposal that shows up across several ledger entries (the same skill never applied, the same
task shape blocking repeatedly) is a candidate for `specs/agent-improvements.md`, the existing
backlog of applied/not-applied agent changes with run evidence. That promotion is a separate,
human-triggered step — this skill only writes the ledger entry; it does not edit
`specs/agent-improvements.md` or `.claude/agents/README.md` itself.

## Known limits (new skill, unverified)

- No smoke run yet — never exercised against a real `run-plan` execution or a hand-run spec chain.
- `subagent_tokens` in a `task-notification` is the only hard token number available; whether it
  is per-spawn cumulative across `SendMessage` continuations of the same agent, or resets, is
  unverified — treat a continued agent's total as the last notification's figure, not a sum,
  until checked against a real multi-continuation run.
- `deep` mode's git-range detection (which commits belong to "this workflow") has no defined
  heuristic yet beyond "since the first agent spawn in this conversation" — a session mixing
  manual commits with agent work may misattribute some.
- Whether a model name is reliably recoverable from an agent's hand-back report (vs. only from
  `.claude/agents/<name>.md`'s frontmatter, which this skill is not told to read) is unverified;
  falling back to the agent definition file is a likely fix if reports don't carry it.
