# Agents

Project subagents for Claude Code. This file is a **map**: what each agent is for, what it may do, and what it consumes and produces. The full rules live in each agent's own file — edit those, not this table.

## Set at a glance

| Agent | Role | Model | Tools | Writes |
|---|---|---|---|---|
| [`researcher`](researcher.md) | Read-only fact finding (repo or external) | `sonnet` | Read, Grep, Glob, Bash, WebFetch, WebSearch | nothing |
| [`planner`](planner.md) | Turns a request into a phased Development Plan | `opus` | Read, Grep, Glob, Bash, Write, Skill | the spec + its task-cards file in `specs/` |
| [`implementer`](implementer.md) | Executes one plan task, self-verifies | `sonnet` | Read, Grep, Glob, Edit, Write, Bash, Skill | files in the task's `Owned paths`, package `INSIGHTS.md` |
| [`test-writer`](test-writer.md) | Adds/updates tests for existing code; never touches production code | `sonnet` | Read, Grep, Glob, Edit, Write, Bash, Skill | test files (`client/src/**/*.test.ts(x)`, `server/test/**`, `reviewer-core/test/**`), package `INSIGHTS.md` |
| [`architecture-reviewer`](architecture-reviewer.md) | Read-only layering/placement review of a change set | `opus` | Read, Grep, Glob, Skill | nothing |
| [`plan-verifier`](plan-verifier.md) | Checks code against every spec item with executed evidence | `sonnet` | Read, Grep, Glob, Bash, Skill | nothing |
| [`doc-writer`](doc-writer.md) | Turns an implemented spec into docs with Mermaid diagrams | `sonnet` | Read, Grep, Glob, Edit, Write, Skill | Markdown under `docs/` and `specs/` folders (+ the folder README index row) |

Not covered yet: security review agent. Before publishing, `/pr-self-review` is run by hand.

## How they fit together

```
request ─▶ (researcher: optional facts) ─▶ planner ─▶ specs/<name>.md ─▶ implementer (per task T#) ─▶ report
                                              │                                │
                                  Clarification needed /            blocked + Questions
                                  Open decisions ──▶ parent session asks the user, then re-invokes
```

- The **parent session** (you / the main Claude) is the only one who talks to the user and who commits. Subagents have no `AskUserQuestion`: anything they can't decide comes back as a `Clarification needed` block, `Open decisions`, or `Status: blocked` + `Questions`, and the parent resumes them with the answers.
- The plan file is the contract between `planner` and `implementer`. Pass the implementer the **absolute path** of the spec and a task ID (`T1`…). Tasks with `Depends-on: none` and disjoint `Owned paths` may run concurrently.
- Maps to the AGENTS.md 5-phase workflow: `researcher` + `planner` = phases 1–2, `implementer` (+ optional `test-writer`) = phase 3, `architecture-reviewer` + `plan-verifier` = the review part of phase 4, `doc-writer` = docs in phase 5. E2e, commits and the Delivery log stay with the parent session.

```
implementer ─▶ (test-writer: gaps) ─┬─▶ architecture-reviewer ─▶ findings ─┐
                                    └─▶ plan-verifier ─▶ item table ───────┴─▶ parent ─▶ fix loop ─▶ implementer
                                                                                  │
                                                                                  └─ spec done ─▶ doc-writer ─▶ /pr-self-review (by hand) ─▶ parent commits
```

- `architecture-reviewer` and `plan-verifier` are independent fresh-context evaluators; neither writes, so they may run in parallel. `architecture-reviewer` has no Bash: the parent **must** pass the base ref, `git diff --name-status` and the unified diff saved to a scratchpad file it can read (no diff file → it asks instead of reviewing whole files).

### Working rules for the parent (from `specs/agent-improvements.md`, applied 2026-09-24)

- **One author per artifact.** One `planner` at a time, and one owner per file. Before summarising a planner's result to the user, compare the file on disk with the agent's report — a discarded parallel plan can leave the report describing a file that no longer exists.
- **Who reads what.**

  | Agent | Reads | Hands back |
  |---|---|---|
  | `planner` | researcher findings (trusts `high` + `path:line`), docs/specs/INSIGHTS, code | spec + `<name>.tasks.md` cards |
  | `implementer` | its task card (+ the Design section the card points to) | short reply, full report in the scratchpad |
  | `plan-verifier` | the whole spec (needs every requirement) + code | item table, counts from a command |
  | `architecture-reviewer` | the diff file, then context around changed hunks | findings table |
  | `doc-writer` | the spec + implemented code | docs + index rows |

- **Continue, don't cold-start.** The next phase of the same line of work (contracts → reviewer-core → server) should continue the same implementer with `SendMessage` while its context is small. Run agents in parallel only when their `Owned paths` are disjoint.
- **Hand-back format.** `implementer` replies in ≤ ~15 lines starting with `Status: …` and writes the full report to a scratchpad file the parent names. The read-only agents (`architecture-reviewer`, `plan-verifier`) can't write files, so their table is the report; keep it to the table plus Gaps / Not verified.

## researcher

- **Responsibility:** answers a concrete question about this repo (docs/specs/INSIGHTS first, then code) or about external sources (docs, web, changelogs). Never modifies anything, never delegates, never uses `deep-research`.
- **Permissions:** read-only tools; Bash limited by instruction to inspection (`git log/show/blame/diff`, `ls`, `wc`, `date`).
- **Input:** a concrete question. If there is none, or scope is ambiguous, it returns `## Clarification needed` (questions with defaults) and stops. `maxTurns: 30`. Run the external variant only when a decision depends on external facts.
- **Output:** a short structured report (~120 lines at most) — Research question, Summary, an **exists / missing table** (main artifact of a repo report), Findings with `path:line` evidence, a confidence per finding (so the planner knows what it can skip re-checking) and source links, Traps, Sources consulted, **Not found / unverified**. Repo and external questions have separate templates.

## planner

- **Responsibility:** produces a Development Plan that respects the project's modules, skills, local `INSIGHTS.md` and architecture constraints, and names the skills the implementer should apply. Plans; never implements or reviews.
- **Permissions:** read tools + Bash for inspection; `Write` only to create the plan spec (in `specs/`, main checkout, never overwriting). *The path restriction is prompt-enforced only — `Write` cannot be path-scoped in frontmatter and no hook backs it; check `git status` after a run.* `maxTurns: 40`.
- **Skills (preloaded, 13; the implementer has the same minus `mermaid-diagram`):** `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `zod`, `typescript-expert`, `security`, `mermaid-diagram`, `engineering-insights`. Deliberate: it must plan UI, DB and contracts without violating rules the implementer will follow.
- **Input:** a feature/change/bug request (+ researcher findings; it trusts `high`-confidence ones with `path:line`). Unplannable requests get a `Clarification needed` block instead of a plan.
- **Output:** `specs/<kebab-name>.md` with status `ready | needs decisions | incomplete`, Definition of Done checklist, requirements `R1…`, context with `path:line`, affected packages and contracts, optional Mermaid design, **phased tasks** (`Executor`, `Owned paths`, `Depends-on`, `Risk`, `Known gotchas`, `Skills to use`, `Acceptance`), testing strategy, risks, open decisions, reviewer handoff, unverified, empty `## Delivery log` — **plus `specs/<kebab-name>.tasks.md`, one self-contained card per task** that implementers read instead of the whole spec. Each task's `Owned paths` are checked against its executor's allowed/forbidden paths. The message to the parent is short: absolute spec and cards paths, summary, open decisions.

## implementer

- **Responsibility:** executes one task (or the whole plan in dependency order) in `client/`, `server/`, `reviewer-core/` or `e2e/`; reads local INSIGHTS first; picks the skills each task needs; runs the existing tests and typecheck of touched packages. Checks only its own work against the plan — not an architecture or security review.
- **Permissions:** `Edit`/`Write`/`Bash` with `permissionMode: acceptEdits` (the parent's mode can override it); `maxTurns: 60`. By instruction: edits only inside `Owned paths`; no `git commit/push/checkout/reset/stash`; never touches migrations, lockfiles, `server/clones/`, `e2e/test-results/`; vendored `shared` only when the task says so, mirrored in both copies; no other agents.
- **Skills (preloaded, 12):** the planner's 13 minus `mermaid-diagram` (loaded via `Skill` only when a task lists a diagram); it applies only those each task needs and reports recommended / added / skipped.
- **Input:** absolute path of the spec + task ID + the task-cards file (+ optionally other tasks' owned paths and a scratchpad directory). It reads the card and the Design section it points to, not the whole spec. No plan → `blocked: no plan`. Runs only touched packages' checks per task; full suite, `.it` and e2e belong to the validation phase.
- **Output:** short reply (≤ ~15 lines, `Status:` on line 1) + the full report in `<scratchpad>/implementer-<task>.md` when a scratchpad was given. The report — Status `done | partial | blocked`, Definition of Done, Read before coding, Changed files, Verification (commands and results), Skills applied, Questions (if blocked), Deviations, Insights recorded, Out of scope, Not verified. Side effects on disk: changed files in `Owned paths`, and entries in `<package>/INSIGHTS.md` when something non-obvious is confirmed.

## test-writer

- **Responsibility:** adds or updates tests for code that already exists (a gap after an implementer task, a bug to pin, an untested module) in `client/` (Vitest + RTL, next to the component), `server/test/` (hermetic `*.test.ts`, `*.it.test.ts` for real Postgres) and `reviewer-core/test/`. Never changes production code: untestable code is reported with a suggested seam.
- **Permissions:** `Edit`/`Write`/`Bash`, default permission mode (each write needs approval); `maxTurns: 60`. By instruction: writes only test files and the package `INSIGHTS.md`; Bash only for the verify commands and read-only git/`ls`/`grep`.
- **Skills (preloaded, 7):** `react-testing-library`, `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `typescript-expert`, `engineering-insights`. It follows repo precedent over the RTL skill: `fireEvent` + `vi.mock`, because `user-event` and `msw` are not installed.
- **Input:** a target (file/module/component/bug or spec path). No target → `Clarification needed`.
- **Output:** a test report — Status, Definition of Done, Seams tested, Changed files (tests only), Verification, Untestable / needs production change, Production bugs found, Not verified.

## architecture-reviewer

- **Responsibility:** read-only review of layering and placement on the added/changed lines: server onion rings, reviewer-core purity, client placement and import boundaries, `@devdigest/shared` changes mirrored in both copies. Baselines (onion D1–D9, frontend accepted exceptions) are not findings. No PASS/BLOCK verdict — that stays with `/pr-self-review`.
- **Permissions:** `Read, Grep, Glob, Skill` only — read-only by tool list, not by prompt text; `maxTurns: 40`.
- **Skills (preloaded, 4):** `onion-architecture`, `frontend-architecture`, `next-best-practices`, `zod`. Reads `.claude/skills/pr-self-review/references/severity.md` for the shared severity scale.
- **Input:** base ref, `git diff --name-status` and a diff file to read, from the parent — **required**. Missing → `Clarification needed`. Checks explicitly that every new I/O port has an adapter, a mock in `adapters/mocks.ts` (onion §4.4) and a container override.
- **Output:** findings table `# | Severity | path:line | Rule | What | Recommendation`, baseline hits skipped, Questions (low confidence), Not verified. No evidence → no finding; zero findings is valid.

## plan-verifier

- **Responsibility:** checks the code against every requirement, task acceptance and Definition-of-Done item of a spec, one row per item, with executed evidence. Status vocabulary `PASS | PARTIAL | MISSING | UNVERIFIED` (`UNVERIFIED` counts as not PASS). The verdict counts are computed by a command (`printf … | sort | uniq -c`) from the table's statuses, not typed. Fixes nothing.
- **Permissions:** `Read, Grep, Glob, Bash, Skill`, no Write/Edit; `maxTurns: 50`. Bash limited by instruction to a baseline command set (server/client typecheck and unit tests, `.it` when Docker is up, reviewer-core build and test, `diff -r` of the two shared copies, the onion greps), read-only git, `ls/wc/date/grep/diff`, and `printf | sort | uniq -c`; no redirects, installs or migrations.
- **Skills (preloaded, 2):** `onion-architecture`, `frontend-architecture` (placement maps tell it where an item's code should be).
- **Input:** absolute spec path (+ optionally base ref / changed files). No spec → `Clarification needed`.
- **Output:** verdict `complete | incomplete` with command-derived counts, Commands run, the item table `# | Item | Status | Evidence | Notes`, Gaps affecting correctness, Not verified.

## doc-writer

- **Responsibility:** turns an implemented spec into docs-as-code with Mermaid diagrams, placed by a map derived from the real `docs/`/`specs/` folders, and adds the folder README index row. Never overwrites existing docs.
- **Permissions:** `Edit`/`Write`, no Bash, default permission mode; `maxTurns: 40`. By instruction: only Markdown under `docs/` and `specs/` folders; never `docs/agent-prompts/`, `docs/skill-fixtures/`, `e2e/specs/*.flow.json`, package `README.md`s, `INSIGHTS.md`, the Delivery log.
- **Skills (preloaded, 2):** `mermaid-diagram`, `writing-for-agents` (user-level, see Known limits).
- **Input:** a spec path or topic and the wanted doc type. Unclear → `Clarification needed`. If the request names a forbidden path, line 1 of its reply is `Forbidden path requested: <path>` and the ready-to-paste edit goes in the report for the parent to apply (the rule is not loosened — the planner is what gets fixed).
- **Output:** a docs report — Files written (path → type → why here), Index rows added, Diagrams, Spec/code mismatches, Suggestions outside its scope, Not verified (Mermaid not rendered; `mmdc` isn't installed).

## Sources behind the rules

Sources are Anthropic documentation and engineering posts, fetched by `researcher` on 2026-09-24; the project's own rules come from `AGENTS.md`. "Inference" marks rules that no source states directly.

- **S1** — [Claude Code sub-agents](https://code.claude.com/docs/en/sub-agents)
- **S2** — [Claude Code skills](https://code.claude.com/docs/en/skills)
- **S3** — [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- **S4** — [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- **S5** — [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- **S6** — [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **S7** — [How and when to use subagents](https://claude.com/blog/subagents-in-claude-code)
- **S8** — [PubNub: best practices for subagents](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/) (secondary, 2025)

| Rule | Source | Where it lives |
|---|---|---|
| Descriptions state the trigger ("Use BEFORE/AFTER…"), details go in the body | S1, S7 | `description` of planner and implementer |
| Explicit `tools` allowlist (omitting it inherits everything); no `Agent` tool so subagents don't nest | S1, S8 | `tools` of both; "Don't spawn other agents" |
| `skills:` injects full skill bodies at startup; a missing skill only logs a debug warning, so keep a `Skill` fallback | S1 | `skills:` of both; implementer's "Skill catalog" section |
| Subagents have no `AskUserQuestion` → questions go back to the parent | S1 | planner "Clarify first" / Open decisions; implementer `blocked` + Questions; researcher `Clarification needed` |
| `maxTurns` bounds a run | S1 | `maxTurns` in frontmatter |
| Delegation carries objective, output format, boundaries and artifact references | S5 | "What you receive", "Hard constraints", "Output format" |
| Write structured output to storage, return a short reference | S5, S6 | planner saves the spec and returns path + summary |
| Separate generator from evaluator (fresh-context review) | S4, S7 (inference for "no self-review") | implementer DoD is a self-check against the plan only; reviewers are separate agents |
| Plan → validate → execute for higher-risk work | S3 | planner→implementer; measurable `Acceptance`; DoD before hand-off |
| Definition of Done checklist per agent | S8 | DoD sections of planner and implementer (items are ours) |
| Progressive disclosure: don't paste skill content, reference by name | S2, S3 | planner "reference them by name" |
| Plan/report formats, statuses, task fields | Inference from S5, S6, S8 — no official schema exists | "Output format" sections |
| Reviewer tool list `Read, Grep, Glob` (read-only by tools, not prompt text); Bash is not read-only | A, B (below) | `tools` of `architecture-reviewer` and `plan-verifier` |
| Verifier evidence = executed output; one row per item; "report only gaps that affect correctness or stated requirements, not style" | C (below) | `plan-verifier`, anti-sycophancy line in both evaluators |
| Placement map by content type, Mermaid pitfalls and keyword allowlist | D (below) | `doc-writer` |
| Project rules: docs/specs/INSIGHTS first, do-not-touch, vendor mirror, lesson scope, `engineering-insights`, verify commands | `AGENTS.md` | Hard constraints and workflow of all three agents |

Sources for the four review/docs agents (from `specs/review-and-docs-subagents.md`, fetched 2026-09-24; primary = official docs, secondary = vendor/blog, "ours" = a design choice no source prescribes):

- **A** (primary) — [sub-agents](https://code.claude.com/docs/en/sub-agents), [best-practices](https://code.claude.com/docs/en/best-practices): `tools` allowlist, Bash is not read-only, description drives delegation, `skills:` injects full bodies.
- **B** (primary for tool docs) — sub-agents docs, [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md), [ArchUnit](https://www.archunit.org/userguide/html/000_Index.html): read-only via tool list; deterministic checks as optional evidence. The finding schema `path:line + rule + severity + recommendation` is ours.
- **C** (primary / secondary) — Claude Code best-practices, Jama RTM article, [GitHub Spec Kit](https://github.com/github/spec-kit/blob/main/spec-driven.md): evidence-per-item, fresh-context verifier. The `PASS/PARTIAL/MISSING/UNVERIFIED` vocabulary is ours (renamed from `done/partial/missing/unverifiable` to match the PASS/PARTIAL/MISSING the user asked for).
- **D** (primary; type-by-question mapping secondary) — [Diátaxis](https://diataxis.fr/), [ADR](https://adr.github.io/), [Mermaid syntax](https://mermaid.js.org/intro/syntax-reference.html), [GitHub diagrams](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams), [Write the Docs](https://www.writethedocs.org/guide/docs-as-code/): the spec → Diátaxis mapping is ours.

## Known limits

- The planner's write scope and the implementer's `Owned paths` are instructions, not enforcement (no `PreToolUse` hook; hooks are deferred course material).
- Preloading 13 skills into `planner` and 12 into `implementer` makes their context large (≈141 KB of `SKILL.md`, ≈35k tokens by size — an estimate). Not checked whether `skills:` injects the full file or only the description. Only `mermaid-diagram` was dropped from `implementer`; splitting it into server/client variants is deferred (`specs/agent-improvements.md`, "Later").
- Not yet verified: whether prompt caching hits across sequential agent spawns; whether `haiku` can run the mechanical stages (seed, e2e flow, docs) without missing INSIGHTS traps; whether `Bash(git diff:*)`-style restrictions work in an agent's `tools` (until then the diff-file input is the safe route).
- The implementer's skill catalog duplicates [`../skills/README.md`](../skills/README.md); update both when a skill is added.
- Bash is not read-only: `test-writer` and `plan-verifier` are restricted to verify commands and read-only inspection by instruction only. Check `git status` after every run; a hook guard is a possible follow-up (per-command `Bash(...)` rules in `tools` and frontmatter `hooks:` are unverified in Claude Code 2.1.281).
- Write scope of `test-writer` (test files only) and `doc-writer` (`docs/`/`specs/` Markdown only) is instruction-only, like the planner's and implementer's. The four newer agents run in default permission mode (no `acceptEdits`), so each write asks for approval.
- `writing-for-agents` (preloaded in `doc-writer`) is a **user-level** skill (`~/.claude/skills/`, not `.claude/skills/`): on another machine it is missing, and a missing preloaded skill only logs a debug warning. `tdd` is deliberately not preloaded (its red-before-green loop contradicts a test-after subagent).
- `architecture-reviewer` has no Bash, so it depends on the parent passing the diff; `mmdc` isn't installed, so `doc-writer`'s Mermaid is never rendered by the agent.
- The four newer agents are covered by smoke runs only (spec `specs/review-and-docs-subagents.md`, phase 3); no evals exist.
- Verified only by two smoke runs (2026-09-24) on test-only client changes; server/DB/UI-component tasks and the `blocked` path haven't been exercised.
