# DevDigest — agent guide

Local-first AI PR reviewer. Course starter: Part-0 works end to end; each lesson adds one feature.
Flow: add repo → server clones + `repo-intel` indexes it → import PRs from GitHub → run an agent review
(`reviewer-core`: diff + repo map → prompt → LLM → grounded findings) → persisted to Postgres.

## Before answering
Always search the relevant package's `docs/`, `specs/`, and `INSIGHTS.md` for what the
user asks about FIRST — these are curated and may already answer it — then read code.

## Layout
| Package | What | Pkg mgr | Port |
|---|---|---|---|
| `server/` (`@devdigest/api`) | Fastify + Drizzle/Postgres (pgvector); feature modules in `src/modules/<name>/` | pnpm | 3001 |
| `client/` (`@devdigest/web`) | Next.js 15 studio; routes in `src/app/`, API client in `src/lib/` | pnpm | 3000 |
| `reviewer-core/` | Pure review engine (no DB/GitHub/FS), imported as TS source | npm | — |
| `e2e/` | Deterministic agent-browser flows (`specs/*.flow.json`) | npm | — |

Only Postgres runs in Docker; API and web run on the host.

## Commands
- Whole stack: `./scripts/dev.sh` (`--no-seed` · `--no-client` · `--db-only`). Migrations are NOT run on boot — `cd server && pnpm db:migrate`.
- Server tests: unit `pnpm exec vitest run --exclude '**/*.it.test.ts'` · integration (Docker) `pnpm exec vitest run .it.test` · typecheck `pnpm typecheck`.
- Client: `pnpm test` · `pnpm typecheck`. reviewer-core: `npm test`.
- E2E: `./scripts/e2e.sh` — isolated fresh Postgres on alternate ports (5433/3101/3100), safe alongside a dev stack.

## Conventions (not obvious from code)
- NOT a monorepo workspace — each package has its own package.json/lockfile; cross-package code is shared via tsconfig path aliases.
- `server` and `client` use pnpm; `reviewer-core` and `e2e` use npm.
- Modules are registered statically in `server/src/modules/index.ts` (no filesystem autoload).
- ESM: relative imports carry the `.js` extension.
- `@devdigest/shared` (Zod contracts) exists as TWO copies: `server/src/vendor/shared/` (canonical; `reviewer-core` aliases to it) and `client/src/vendor/shared/` (the client's own copy). A contract change must be mirrored into both. The client copy already lags the server on lesson-era files — don't "sync" whole files unasked.
- CI is path-filtered per package; `reviewer-core/**` changes also trigger `server-unit` (server type-checks against its source).
- `server/package.json` is `skip-worktree` locally — CI calls `pnpm exec vitest …` rather than committed test scripts.
- Reviewer prompts: the DB (`agents.system_prompt`) is the runtime source of truth; `docs/agent-prompts/*.md` are the reviewable originals — change both.
- Starter scope — L01–L08 features are intentionally absent; don't add them unasked.

## Do-not-touch
- `server/src/vendor/shared/` and `server/src/db/migrations/` — never hand-edit without coordination.
- `server/clones/` — runtime checkouts, not source.

## Use when
- Stack, commands, architecture, how to run, lesson roadmap → read `README.md`
- Test lanes and CI layout → read `TESTING.md`
- Working inside a package → read that package's CLAUDE.md: `server/CLAUDE.md`, `client/CLAUDE.md`, `reviewer-core/CLAUDE.md`, `e2e/CLAUDE.md`
- Agent prompt templates, prompt assembly, output schema, scoring → read `docs/agent-prompts/`
- Cross-package findings → read/append `INSIGHTS.md` (use the `engineering-insights` skill)
- Project skills catalog (Fastify, Drizzle, Next, Zod, …) → read `.claude/skills/README.md`
