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

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

### Why does a real review store `confidence: 0` on every finding?

`server/src/vendor/shared/contracts/findings.ts:57` · `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/constants.ts:4` · `GET /repos/bb2312bb-a43b-46ca-8865-a9ac9dd16e43/pulls` (PR #24) · 2026-09-17

All six persisted findings of PR #24's latest review have `confidence: 0`, so the UI shows "0% conf" everywhere. With "Hide low confidence" on (threshold 0.65), every one of them would be hidden. The seeded findings (0.98 / 0.86) are fine, so the UI is not the cause.

Not investigated. The candidates are: the model actually returning 0 (e.g. a provider that doesn't honour the schema), `reviewer-core` dropping or defaulting the field while parsing the output, or the server's `insertFindings` persisting it wrong. The first thing to check is that run's trace (`GET /runs/:id/trace`) for the raw model output.

**Answered 2026-09-17: it's the model, not our pipeline.** Run `bf477bb5-c8f1-41e5-8ae6-739a09cd6c63` (Performance Reviewer, `deepseek/deepseek-v4-flash`): its trace `raw_output` literally contains `"confidence": 0` for all 6 findings, and the pipeline persisted them faithfully. The next Performance Reviewer run on the same PR, same model, returned 0.95 / 0.85. So the model sometimes emits 0 when it fills the required field. `confidence` is `z.number().min(0).max(1)` with no guidance in the prompt, so 0 is schema-valid. Side effect: "Hide low confidence" (threshold 0.65, `FindingsPanel/constants.ts`) hides *every* finding of such a run. Not fixed. Possible options: describe `confidence` in the schema/prompt, or treat an all-zero run as "confidence unknown".
