# PR Self-Review skill: plan

> Plan from 2026-09-19. This is a plan only; the skill hasn't been created yet.
> Proposed skill: `.claude/skills/pr-self-review/`, scope **Shared** (every package).
> It answers one question: *"Is my local change safe to push and open as a PR, according to our own skills?"*
> Verdict: **PASS** or **BLOCK**. One CRITICAL finding means BLOCK.

---

## 1. What we already have

| Skill | Scope | Has a review checklist? | Has its own severity scale? | Fit for a diff review |
|---|---|---|---|---|
| `frontend-architecture` | client | yes, §11 (10 questions) + "Known debt" | no | high: project-specific |
| `react-best-practices` | client | rule catalog | CRITICAL / HIGH / MEDIUM | high, but its CRITICAL includes "maintenance nightmares" and "over-engineering", so it's too broad for a gate |
| `next-best-practices` | client | rules by topic (RSC boundaries, directives, errors…) | no | medium: only for `app/**` files and `'use client'` / RSC changes |
| `react-testing-library` | client tests | anti-patterns | no | medium: only `*.test.tsx` |
| `onion-architecture` | server | yes, §9: 4 grep gates + 7 checks by eye; D1–D9 baseline | no | high: grep gates are deterministic |
| `fastify-best-practices` | server | rules/*.md | no | medium: `routes.ts`, `platform/` |
| `drizzle-orm-patterns` | server | no | no | medium: `repository*`, `db/schema` |
| `postgresql-table-design` | server | core rules | no | medium: `db/schema/*` only |
| `zod` | full-stack | 43 rules by impact | CRITICAL / HIGH / … per category | medium: files that import `zod` |
| `typescript-expert` | full-stack | §"Code Review Checklist" | no | low: generic and noisy |
| `security` | full-stack | `checklists.md` "Pre-Commit Security Self-Review" | CRITICAL / HIGH / MEDIUM / LOW (exploitability) | high, but written for Express + MongoDB + JWT; needs mapping to Fastify + Postgres |
| `mermaid-diagram`, `engineering-insights` | shared | — | — | **not reviewers**: excluded |

Also relevant:
- The global `code-review` skill already reviews "since a fixed point" on two axes (standards + spec). `pr-self-review` is narrower: it routes files to *our* skills and gives a hard verdict. It shouldn't duplicate the spec axis. Decision Q6 covers this.
- `AGENTS.md` gives deterministic rules that need no LLM: *Do-not-touch* (migrations, lockfiles, vendored shared), the two-copy `@devdigest/shared` rule, prompts in DB + `docs/agent-prompts/*.md`, and "Verify" commands per package.
- No `.claude/settings.json` and no hooks exist yet. The Stop-hook for `engineering-insights` is deliberately left for L06. A hook for this skill is a *new* decision (Q1).
- CI (`.github/workflows/*`) runs typecheck + tests per package. It doesn't run the skills.

## 2. Trigger: when it runs

1. **Manually:** `/pr-self-review [--base <ref>]`. The default base is `git merge-base HEAD main`.
2. **Before a GitHub call made by the agent:** a Claude Code `PreToolUse` hook on `Bash` matches `gh pr create`, `gh pr merge`, `git push` (and `gh pr ready`). The hook script is cheap and has no LLM. It:
   - computes a fingerprint of the change (see §3) and looks for `.git/pr-self-review/<fingerprint>.json`;
   - if that file says `PASS`, the command goes through;
   - otherwise it exits with code 2 and the message "run /pr-self-review first". Claude sees this, runs the skill, and retries.

   So the hook doesn't run the review itself. It only enforces that a passing review exists for **exactly this** diff. Any edit changes the fingerprint and makes the old PASS invalid.
3. *(Optional, Q2)* A git `pre-push` hook calls the same fingerprint check, so a push from the user's own terminal is also gated. Scripts live in the repo and are enabled via `git config core.hooksPath`, because `.git/hooks` isn't versioned.

**Limit to state clearly:** a local gate can block *push / PR creation / `gh pr merge` via the agent*. It can't stop someone pressing "Merge" on GitHub. That needs a CI job or a required check, which is L06 ("Export to CI"). Decision Q2.

## 3. The change set: "all open changes"

- Committed on the branch: `git diff <base>...HEAD`
- Staged + unstaged: `git diff HEAD`
- Untracked (not ignored): `git ls-files --others --exclude-standard`. `git diff` doesn't show these; right now `.claude/skills/onion-architecture/` is exactly such a case.
- Fingerprint = sha256 over (base sha, HEAD sha, `git diff HEAD` output, names + contents of untracked files).
- Review **only added or changed lines** (hunks with context). Pre-existing debt (onion D1–D9, frontend "Known debt") is **never** a blocker unless the diff *adds a new instance* of it.
- Skip: `server/clones/**`, `e2e/test-results/**`, binaries, generated `meta/*.json` snapshots (they're checked by rule R3 instead).

## 4. Routing: which skill reviews which file

A script `scripts/route.sh` (or `.ts`) prints the file → skill-set table, so routing is deterministic and testable.

| Path pattern | Skills applied |
|---|---|
| `client/src/**/*.tsx` | `frontend-architecture`, `react-best-practices`, `typescript-expert`* |
| `client/src/app/**` (`page`, `layout`, `error`, `not-found`, `route`), any file whose `'use client'` changed | + `next-best-practices` |
| `client/src/lib/**/*.ts`, `client/src/components/**` | `frontend-architecture`, `typescript-expert`* (+ `react-best-practices` for hooks) |
| `client/**/*.test.tsx` | `react-testing-library` |
| `client/messages/**/*.json` | `frontend-architecture` i18n rules (namespace/key naming) |
| `server/src/modules/**`, `server/src/adapters/**`, `server/src/platform/**` | `onion-architecture` (grep gates + by-eye checks), `typescript-expert`* |
| `server/src/modules/*/routes.ts`, `platform/**` | + `fastify-best-practices` |
| `**/repository*.ts`, `*.repo.ts`, `server/src/db/**` | + `drizzle-orm-patterns` |
| `server/src/db/schema/**` | + `postgresql-table-design` |
| `reviewer-core/src/**` | `onion-architecture` (pure-core rule: no DB/FS/GitHub), `typescript-expert`* |
| any file that imports `zod` or lives under `vendor/shared/` | + `zod` |
| server routes, auth, adapters, anything using `dangerouslySetInnerHTML`, `react-markdown`, `exec`/`spawn`, `simple-git`, env/secrets | + `security` (read with the Fastify/Postgres mapping from §6) |
| `e2e/**`, `docs/**`, `specs/**`, `.claude/**` | deterministic rules only (§5); no stack skill |

\* `typescript-expert` runs only with its "Code Review Checklist" section and never raises CRITICAL on its own (it's generic, so the risk of noise is high).

**How a skill is "run":** the reviewer loads the skill's `SKILL.md` (plus the relevant file from `rules/` or `references/`) as the rubric and applies it to the routed hunks. It doesn't invoke the skill's authoring workflow.

**Execution (Q4):** three parallel reviewer sub-agents, one per group: **UI** (client skills), **Backend + domain** (onion, fastify, drizzle, postgres, zod on server/reviewer-core), and **Security** (cross-cutting). Each gets only its routed hunks + the rubric files and returns findings as JSON. The orchestrator merges, deduplicates and assigns the verdict. For a small diff (< ~150 changed lines, one group) it runs inline without sub-agents.

## 5. Deterministic gates (run first, no LLM)

| # | Rule | Severity |
|---|---|---|
| R1 | `typecheck` of every touched package (`pnpm typecheck` / `npm run build`) | CRITICAL if it fails |
| R2 | Unit tests of every touched package (server: `pnpm exec vitest run --exclude '**/*.it.test.ts'`; client `pnpm test`; reviewer-core `npm test`). Integration/e2e: not by default (Q5) | CRITICAL if they fail |
| R3 | A file in `server/src/db/migrations/**` changed but `server/src/db/schema/**` didn't, or an existing migration was renamed or edited (not only added) | CRITICAL |
| R4 | A lockfile changed with no change to the matching `package.json` | CRITICAL |
| R5 | `server/src/vendor/shared/**` changed with no matching change in `client/src/vendor/shared/**` (or the reverse) for the same contract file | HIGH (CRITICAL if a field was removed or renamed) |
| R6 | `agents.system_prompt` seed/DB changed without `docs/agent-prompts/*.md`, or the reverse | HIGH |
| R7 | Onion §9 grep gates, applied only to **added** lines of `server/src` | HIGH by default; CRITICAL for `process.env` outside `platform/config` and adapter → `modules/` imports (Q3) |
| R8 | Secret scan on added lines (API-key patterns, `.env*` files staged, private keys) | CRITICAL |
| R9 | A new `lint`/formatter script or config added (`AGENTS.md` forbids adding one unasked) | HIGH |
| R10 | A new server module not registered in `server/src/modules/index.ts` | CRITICAL (the module is dead code at runtime) |

If R1 or R2 fails, the skill still runs the LLM review (so the user gets the full picture), but the verdict is already BLOCK.

## 6. Severity model: one scale for all skills

Each skill has its own scale, or none. The self-review uses **one** scale, and **CRITICAL = blocks**:

| Level | Meaning in this repo | Examples |
|---|---|---|
| **CRITICAL** (blocker) | Will break at runtime, lose or corrupt data, open an exploit, break a contract between packages, or violate *Do-not-touch* | failing typecheck/tests; exploitable injection/XSS; secret in code; hand-edited migration; contract field removed in one copy only; conditional hook call; server data mutated in the render path; SDK call bypassing a port **in reviewer-core**; missing `key` on a reordered list |
| **HIGH** | A new architecture violation or a clear bug risk, but it works | new Drizzle query in a route handler; new cross-module import; fetch outside `lib/api.ts`/`lib/hooks`; server data copied into `useState`; hard-coded UI string |
| **MEDIUM** | Maintainability | component that should be split; logic in a component body instead of `helpers.ts`; weak test queries |
| **LOW / NIT** | Style, naming | naming convention slips, comment wording |

Mapping from each skill's own labels:
- `react-best-practices` CRITICAL → CRITICAL **only** for bug-class rules (hooks rules, keys, derive-don't-store that causes stale UI). Component design / over-engineering → MEDIUM.
- `security` CRITICAL/HIGH → as is, but only if the reviewer states the attack path (the skill's own "high confidence only" rule). The Express/Mongo/JWT examples map to Fastify / Drizzle `sql` raw / the local auth adapter.
- `zod` category impact → never CRITICAL on its own, except a request body that isn't parsed at the boundary (→ HIGH; CRITICAL if the value reaches SQL/shell/FS).
- `onion-architecture`, `frontend-architecture` (no scale) → HIGH for a new violation of a checklist item, CRITICAL only as listed above.
- A finding needs a `file:line` on an **added** line, the rule and skill it comes from, and a concrete fix. A finding without evidence is dropped. This protects against a false BLOCK.

## 7. Output

1. A report in the terminal: verdict, a summary line with counts by severity and group, then a table `severity · file:line · skill/rule · problem · fix`, CRITICAL first.
2. A marker `.git/pr-self-review/<fingerprint>.json` with `{verdict, base, head, fingerprint, counts, created_at}`. Only a PASS marker opens the hook.
3. Nothing is written into the repo tree, and no auto-fixes. The skill reports; the user or agent fixes and re-runs (Q7).

## 8. Files the skill will add

- `.claude/skills/pr-self-review/SKILL.md`: workflow (collect → route → gates → review → verdict → marker), the severity model, the report format.
- `.claude/skills/pr-self-review/references/routing.md`: the §4 table, with the reason for each row.
- `.claude/skills/pr-self-review/references/severity.md`: the §6 scale + per-skill mapping + CRITICAL examples.
- `.claude/skills/pr-self-review/references/reviewer-prompt.md`: the brief each sub-agent gets (rubric files, hunks, JSON output schema).
- `.claude/skills/pr-self-review/scripts/collect.sh`: change set + fingerprint (§3).
- `.claude/skills/pr-self-review/scripts/route.sh`: file → skill groups (§4).
- `.claude/skills/pr-self-review/scripts/gates.sh`: R1–R13.
- `.claude/skills/pr-self-review/scripts/check-marker.sh`: used by the Claude hook and the optional git `pre-push`.
- `.claude/settings.json`: the `PreToolUse` hook (the first project settings file, Q1).
- `.claude/skills/pr-self-review/evals/evals.json`, `README.md`, `CHANGELOG.md` (same versioning as `onion-architecture`).
- A catalog row in `.claude/skills/README.md`, a *Use when* line in root `AGENTS.md`, and a spec `specs/pr-self-review-skill.md` with a Delivery log.

## 9. Evals (skill-creator loop)

Seeded diffs on a scratch branch, with an expected verdict:
1. A clean UI change (new component in `_components`, test, i18n key) → PASS.
2. A route handler that adds a `container.db.select` → HIGH, PASS (not a blocker) — checks we don't over-block.
3. `dangerouslySetInnerHTML` with PR body markdown → CRITICAL, BLOCK.
4. A hand-edited migration file → R3, BLOCK.
5. A contract field renamed in `server/src/vendor/shared` only → R5 CRITICAL, BLOCK.
6. A hook called inside `if` → CRITICAL, BLOCK.
7. A diff touching a file with existing D1 debt, but not adding to it → no finding for D1.
8. The hook: `gh pr create` with no marker → blocked; after PASS → allowed; after one more edit → blocked again.

Assertions check the verdict + that the expected rule is cited with the right `file:line`. The onion evals had a 100%/100% pass rate with and without the skill, so the assertions must be ones a baseline without the skill would fail (see root `INSIGHTS.md`).

## 10. Traps

- `git diff` doesn't see untracked files, so a brand-new skill folder would pass unreviewed.
- A hook matching `git push` must also catch compound commands (`git add . && git push`), and `gh pr create` with any flags.
- The hook only sees commands run through Claude, not the user's terminal. This is why the optional `pre-push` exists.
- LLM reviewers over-report. Without the "added line + evidence + rule" requirement, a single invented CRITICAL blocks the push, and people learn to bypass the gate.
- `security` and `typescript-expert` are generic (Express/Mongo; any TS). Unmapped, they flood the report.
- `next-best-practices` is `user-invocable: false`. That's fine: reviewers read the file; they don't invoke it.
- Running `pnpm test` on every push is slow. Only touched packages, and only unit tests.
- The marker lives in `.git/`, so it's never committed and is per-clone.

## 11. Decisions (agreed with the user on 2026-09-20)

| # | Question | Decision |
|---|---|---|
| Q1 | Add a Claude Code `PreToolUse` hook now (the first `.claude/settings.json`), or leave hooks for L06 as with `engineering-insights`? | **Add it now.** `PreToolUse` on `Bash`, matching `gh pr create`, `gh pr merge`, `git push`; it runs `check-marker.sh` only |
| Q2 | Also add a git `pre-push` hook and/or a CI job, so the merge itself is blocked on GitHub? | **`pre-push` yes** (`scripts/pre-push`, enabled via `git config core.hooksPath`). No CI job — a required check stays L06 |
| Q3 | Is a new onion / frontend-architecture violation HIGH (warn) or CRITICAL (block)? | **HIGH.** CRITICAL only for: `process.env` outside `platform/config`, an adapter importing `modules/`, a new SDK/DB/FS call in `reviewer-core`, a new module missing from `modules/index.ts` |
| Q4 | Parallel sub-agents per group, or one agent sequentially? | **Both.** Inline single pass under ~150 changed lines or a single group; three parallel sub-agents (UI · backend+domain · security) above that |
| Q5 | Run `.it` tests (Docker) and e2e as part of the gate? | **No by default.** Typecheck + unit tests of touched packages; `--full` adds `.it` and e2e |
| Q6 | Relation to the built-in `code-review` skill: replace it, call it, or stay separate? | **Separate.** `pr-self-review` = routed project skills + gates + verdict; `code-review` = the deeper standards + spec read. `SKILL.md` states the boundary |
| Q7 | An override for a false BLOCK? | **Yes, with a reason.** `--accept <finding-id> "reason"` is recorded in the marker and carried into the PR description; repeats go to `references/accepted.md` |
| Q8 | Should HIGH findings also block when there are more than N of them? | **No. Only CRITICAL blocks** |

Skill files are written in English, like every other skill and document in the repo.

## 12. Also in scope (agreed)

1. **Incremental re-review.** Findings are cached per file content hash; a re-run after a fix re-reviews only the files that changed. The deterministic gates (§5) always re-run for the touched packages.
2. **PR description from the report.** On PASS the skill drafts the `gh pr create` body: what changed, which gates passed, remaining HIGH findings, and every `--accept` with its reason.
3. **Missing-test gate.** A new exported function in `helpers.ts` / `lib/*.ts` / `reviewer-core`, or a new repository method with no `.it` test → HIGH. Both architecture skills already require these tests.
4. **i18n key gate (no LLM).** `t('ns.key')` in the diff with no matching key in `client/messages/en/*.json` → CRITICAL (the raw key renders in the UI). A user-visible string hard-coded in JSX → HIGH.
5. **Spec drift.** More than ~N changed lines of product code with no change under `specs/` → HIGH, never a blocker. The 5-phase workflow in `AGENTS.md` expects a spec plus a Delivery log.
6. **Accepted false positives.** `references/accepted.md`: finding, reason, expiry. Suppressed on later runs; a repeat is the signal to fix the source skill.
7. **Quiet mode for the hook.** Invoked by the hook, the skill prints the verdict and CRITICAL findings only; the full table is for manual runs.

Backlog (not in v1.0.0): large-diff split warning, stale-skill check against `metadata.stack`, branch/commit hygiene checks, cost and duration budget. Later, the §4 routing table and §6 severity scale are the natural input for L02 "Skills in the product".
