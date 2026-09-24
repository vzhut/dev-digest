# Agent improvements (backlog)

**Status:** backlog — nothing here is applied. Written 2026-09-24 after the Intent Layer delivery (`intent-layer.md`), from what that run actually cost and where it went wrong. Apply later, one agent file at a time; the agents live in `.claude/agents/`, their map in `.claude/agents/README.md`.

**Goal:** fewer tokens and fewer wasted rounds **without dropping any gate** (independent architecture review, plan verification, live smoke, e2e, typecheck).

## Evidence from the Intent Layer run

Token figures are what the harness reported per finished agent. It is not known whether they include cached reads, so treat them as orders of magnitude. Two interrupted agents (a rate-limit failure, a stopped reviser) have no figure.

| Stage | Tokens | Note |
|---|---|---|
| 2 researchers | 121k | 90k repo, 31k external |
| 3 planners | **701k** | 242k + 239k + 220k, all wrote the same `specs/intent-layer.md`; two outputs discarded |
| Implementer Phase 1–4 | 782k | 152k, 164k, 277k, 190k; each a cold start |
| T10 + T15 | 232k | 126k + 106k |
| T16 + T17 | 216k | e2e 108k, docs 108k |
| Architecture-reviewer + plan-verifier | 214k | 122k + 92k |
| Fix of two review findings | 96k | two small edits |
| **Total** | **≈2.36M** | the product's own LLM cost for the feature is cents |

Concrete failures this run showed:

- Three planners on one file; the summary given to the user described a plan that was no longer on disk.
- Every implementer was told to read the whole 66 KB spec (≈16–20k tokens by size, estimate) although each needed one or two tasks. About ten readers.
- `architecture-reviewer` has no Bash (`tools: Read, Grep, Glob, Skill`), so it reported it could not see `git diff` and read whole files.
- The plan gave doc-writer `docs/agent-prompts/README.md`, which is on its forbidden list; T17 came back partial and was finished by hand.
- `plan-verifier`'s headline (27 done / 4 partial / 0 missing / 3 unverifiable) did not match its own table (26 / 5 / 0 / 3, counted by hand).
- The verifier's status words (`done | partial | missing | unverifiable`) differ from the PASS / PARTIAL / MISSING the user asked for.
- `implementer` and `planner` each preload 13 skills; their `SKILL.md` files total ≈141 KB (≈35k tokens, estimate). Not checked whether the full file or only the description is injected.
- Models are already set in the frontmatter: `planner` and `architecture-reviewer` on `opus`, the other five on `sonnet`.

## Per agent

### planner (`.claude/agents/planner.md`)

**Do first**
1. Emit a second file of **task cards** (e.g. `specs/<name>.tasks.md`): per task only fixed decisions, Owned paths, actions, acceptance, the INSIGHTS traps that apply. Implementers read their card, not the whole spec.
2. Add an **executor agent** field per task and check each task's Owned paths against that agent's allowed and forbidden paths (the `docs/agent-prompts/**` case).
3. Trust researcher facts marked high confidence with `path:line`; spot-check only the ones a contract or schema depends on. The planner made 41–47 tool calls re-deriving facts it was handed.

**Later**
4. Before writing, check whether the target file exists or changed; write with a suffix and say so if it does. This does not remove the race, the real rule is one planner at a time (see Shared).
5. Do not copy the planner's own Definition-of-Done checklist into every spec; one line is enough.
6. Trim preloaded skills (see Shared).

### implementer

**Do first**
1. Read the assigned task card plus the Design section it points to, not "the whole spec".
2. Cap the reply at about 15 lines (status, files, commands with results, deviations) and write the full report to a scratchpad file, returning its path.
3. During a phase run only the touched packages' tests; the full suite and e2e stay as the plan-verifier's gate.
4. Document in the agents README that the next phase of the same line (contracts → reviewer-core → server) should continue the same agent with `SendMessage` while its context is small, instead of a cold start. Run agents in parallel only when Owned paths are disjoint (T10 with T15 was right).

**Later**
5. Split by area (`implementer-server` / `implementer-client`) or trim the skill list; a server task does not need the client skills.
6. Add the trap found in Phase 3: review tests must inject a stub provider, because a real `OPENROUTER_API_KEY` on the machine makes them call the network (`server/INSIGHTS.md`).

### plan-verifier

**Do first**
1. Compute the summary counts from the table with a command instead of typing them (the 27/4/0/3 vs 26/5/0/3 mismatch).
2. Use one status vocabulary, PASS / PARTIAL / MISSING / UNVERIFIED, in the agent file and the README.
3. Give it a baseline command set (server typecheck, unit, `.it`, client typecheck and test, reviewer-core build and test, shared-copy `diff`, and the onion grep) so items are not `unverifiable` merely because a command was outside the brief.

**Later**
4. It reads the full spec (needs every requirement); other agents should not.
5. Full report to a file; the reply carries the summary and every non-PASS item.

### architecture-reviewer

**Do first**
1. Require a **diff file** as input: the caller generates `git diff --name-status` and the diff of changed files into the scratchpad and passes the path. State this in "What you receive".
2. Add an explicit checklist line: every new I/O port has a mock in `adapters/mocks.ts` (onion §4.4); this run's only finding.

**Later**
3. Revisit `opus` after a few runs: keep it while layering checks find things, try `sonnet` if the same checklist holds.
4. Report to a file, short summary in the reply.

### researcher

**Do first**
1. Cap the report length; make an "exists / missing" table the main artifact and keep only findings the question needs.
2. Add `maxTurns` (the only agent without one).
3. Mark each finding's confidence, so the planner knows what it can skip re-checking.

**Later**
4. Run the external researcher only when a decision depends on external facts (31k vs 90k here).

### doc-writer

**Do first**
1. When a path is forbidden, return that as the first line with the ready text of the edit (it did this, but by judgement; make it the format).
2. Do not loosen the `docs/agent-prompts/**` rule; fix the planner instead (planner item 2).

**Later**
3. Add a step that checks every cited `path:line` with a script; it admitted it did not.
4. Mermaid syntax is not rendered (no `mmdc`); either add a check or keep saying "not rendered" in the report.

### test-writer

Nothing urgent. It was not used: implementers wrote their own tests, which is cheaper than another cold start. Use it later for narrow gaps left after review, e.g. the untested `blocked` branch of `MockRepoFileReader` or the 404 case in `routes-smoke`, and say in its description that it is for post-review coverage gaps.

## Shared (`.claude/agents/README.md`, workflow in `AGENTS.md`)

**Do first**
1. **One author per artifact:** one planner at a time, one owner per file; before summarising, compare the file on disk with the report.
2. Reduce preloaded skills for planner and implementer. Heaviest `SKILL.md` sets by directory size: `next-best-practices`, `security`, `onion-architecture`, `frontend-architecture`, `react-testing-library`.
3. One hand-back format: status on line 1, full report in a scratchpad file, a short reply.

**Later**
4. Prompt order for cache reuse: stable material first (fixed decisions, rules, card links), task-specific last. Cache hits were not observed; verify before relying on it.
5. A "who reads what" table: planner writes cards, implementer reads its card, verifier reads the spec, reviewer reads the diff.
6. Try `haiku` only for the mechanical stages (seed, e2e flow, docs); keep planner, the security-sensitive tasks (T6, T8, T10-style) and both reviewers on the stronger models. A weaker model can miss INSIGHTS traps; the verifier is what catches that.

## Product side (not part of this backlog's fixes)

The classifier already receives no diff (file list and `@@` headers only) and runs once per PR, not per agent. The main review still sends the whole diff to each agent; putting shared context ahead of the agent-specific part would allow prefix caching, but it would touch the "prompt byte-identical without intent" test and the review cost is currently about $0.0003. Left as is.

## Do not weaken

The independent architecture review (it found the missing mock), the plan verification, the live smoke (it found the 45 s timeout and the clone without the PR head), the e2e run and the typecheck gates. Everything above trims what surrounds them.

## Open questions before applying

- Whether an agent's `skills:` frontmatter injects the whole `SKILL.md` or only its description.
- Whether prompt caching actually hits across sequential agent spawns.
- Which mechanical tasks a `haiku` agent handles without missing traps; needs a trial on one low-risk task.
- Whether `Bash(git diff:*)`-style tool restrictions are available for an agent's `tools:` list; until confirmed, the diff-file input is the safe route.
