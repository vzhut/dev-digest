# Workflow retro ledger

Manual-only retrospectives over multi-agent Claude Code workflows — cost, order, friction and
proposals for the orchestration itself, not the code it produced. Run by hand: `/workflow-retro`
(in-context) or `/workflow-retro deep` (also mines git log, Delivery log entries and `INSIGHTS.md`
diffs from the run). Append only — never rewrite or delete an entry. See
`.claude/skills/workflow-retro/SKILL.md`.

### Project Context spec — spec-creator phase — 2026-10-01

Mode: default · Agents: 1 · Total tokens: ~137k · Wall time: ~4m30s · Fix-loop rounds: n/a (spec
phase only, no implementation-planner/implementer ran yet)

| # | Agent | Model | Tokens | Tool uses | Duration | Status |
|---|---|---|---|---|---|---|
| 1 | spec-creator | opus | 137,241 | 28 | 4m30s (270,173ms) | done — draft + 11 `[NEEDS CLARIFICATION]` items (by design) |

**Went easily:** One pass, no re-spawn, no `Status: blocked`. It found most of the required
plumbing already existed unused in the repo (`reviewer-core/src/prompt.ts`'s `## Project context`
renderer, `run-executor.ts`'s dead `specs_read: []`, unused client hooks `useContextFiles` /
`useReindexContext`) rather than guessing at new contracts — settled the one real design question
(reviewer-core gets `{path, text}`, no FS access) by reading code, no `researcher` delegation
needed.

**Had difficulty:** Not the agent — the parent/session side took 3 rounds with the user before the
spec stabilized: (1) the initial batch of `AskUserQuestion` calls resolving the 11 open questions,
(2) a correction round after the parent prematurely set `Status: approved` right after the open
questions were answered — the user pushed back ("поверни draft, я сам підтверджу коли буде
готово"), a process misstep since "open questions resolved" ≠ "spec approved", (3) a second
substantive round where the user reversed 2 of the already-"resolved" decisions after seeing them
written out (no version bump at all, vs. the first pass's "yes for agents"; a single "used by N
agents" count, vs. the first pass's `{agents, skills}` split) plus 3 more clarifications (editing
feasibility, missing-doc handling, the chunks→tokens footer wording).

**Duplicated:** None across agents — only one agent ran this phase. The parent applying the user's
answers by hand-editing the spec (≈15 targeted `Edit` calls across two rounds) rather than
re-spawning `spec-creator` for mechanical updates avoided a second ~137k-token agent call; worth
keeping as the default move for post-approval-question edits, not a duplication to fix.

**Missed / caught late:** n/a — no downstream reviewer (`plan-verifier`/`architecture-reviewer`)
has run yet; the workflow hasn't reached a phase where "caught late" is observable.

**Proposals:**
- `spec-creator`'s recommended defaults skewed toward completeness over simplicity on 2 of 11
  questions (an 8k/24k token budget, and a version bump on agent context changes) — both got
  overridden by the user toward "no extra mechanism" when asked directly, and a stated project
  preference ("найлегшу імплементацію") predicted both reversals. Next spec, when a requirement
  doesn't itself state a constraint, bias the recommended default toward the simplest/no-mechanism
  option and label it `(simplest)` explicitly, so more of the first `AskUserQuestion` pass sticks
  and a second revision round isn't needed for the same questions.
- Add an explicit rule (to `.claude/agents/README.md`'s spec-creator section, or the parent's own
  checklist) that resolving `[NEEDS CLARIFICATION]` items never auto-promotes `Status` to
  `approved` — that needs the user's own word, not inferred from "all questions answered". This
  session needed one extra correction turn for exactly that gap.
- Two of the "resolved" decisions from the first `AskUserQuestion` round were reopened and reversed
  in a second round after the user saw them written into the spec text. Consider a lighter-weight
  first pass — present only the questions where the spec's own default is genuinely load-bearing
  (repo scope, doc revision, budget) — and defer minor polish questions (wording, footer labels,
  used-by granularity) to after the user has read the full draft once, instead of batching all 11
  up front.
