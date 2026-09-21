# DevDigest — agent guide

> Canonical guide for every coding agent (Claude Code, Cursor, Codex, Copilot, …). Tool files like `CLAUDE.md` and `.github/copilot-instructions.md` only point here — edit this file.

Local-first AI PR reviewer. Course starter: Part-0 works end to end; each lesson adds one feature.
Flow: add repo → server clones + `repo-intel` indexes it → import PRs from GitHub → run an agent review
(`reviewer-core`: diff + repo map → prompt → LLM → grounded findings) → persisted to Postgres.

## Before answering
Always search the relevant package's `docs/`, `specs/`, and `INSIGHTS.md` for what the
user asks about FIRST — these are curated and may already answer it — then read code.

## Layout & stack
NOT a monorepo workspace — four standalone packages, each with its own `package.json` + lockfile;
cross-package code is shared only via tsconfig path aliases. All packages are **TypeScript 5.7**.

| Package | Role | Stack (key libraries) | Pkg mgr | Port |
|---|---|---|---|---|
| `server/` (`@devdigest/api`) | REST API, persistence, GitHub import, run orchestration, `repo-intel` indexer. Feature modules in `src/modules/<name>/`, adapters in `src/adapters/`, DI in `src/platform/container.ts` | ESM · Fastify 5 + fastify-type-provider-zod + fastify-sse-v2 · Drizzle ORM 0.38 + postgres.js · Postgres 16 + pgvector · Zod 3 · octokit · simple-git · @ast-grep/napi · openai / @anthropic-ai/sdk · p-queue · vitest 2 + testcontainers | pnpm | 3001 |
| `client/` (`@devdigest/web`) | The studio UI. Routes in `src/app/`, API client `src/lib/api.ts` + hooks `src/lib/hooks/`, shared components `src/components/`, vendored UI kit `src/vendor/ui/` | Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl 3 · Zod 3 · lucide-react · react-markdown · mermaid · vitest 2 + React Testing Library + jsdom | pnpm | 3000 |
| `reviewer-core/` (`@devdigest/reviewer-core`) | Pure review engine: diff → prompt → LLM → grounding → findings. No DB/GitHub/FS; imported by the server as TS source | ESM · Zod 3 · openai SDK (OpenRouter structured output) behind an injected `LLMProvider` · vitest 2 | npm | — |
| `e2e/` (`@devdigest/e2e`) | Deterministic browser flows over seeded data (`specs/NN-name.flow.json`) | ESM · agent-browser CLI · tsx runner (`run.ts`) | npm | — |
| `server/src/vendor/shared/` (`@devdigest/shared`) | Zod contracts shared by every package (client keeps its own copy — see Conventions) | Zod 3 | — | — |

Only Postgres runs in Docker (`docker-compose.yml`); API and web run on the host.

## Commands — run
- Whole stack from zero: `./scripts/dev.sh` (flags `--no-seed` · `--no-client` · `--db-only`).
- Manually: `docker compose up -d` → `cd server && pnpm db:migrate && pnpm db:seed && pnpm dev` → `cd client && pnpm dev`.
- Migrations are NOT run on boot — after pulling a migration: `cd server && pnpm db:migrate`.
- New migration: edit `server/src/db/schema/*` → `pnpm db:generate` → `pnpm db:migrate`.

## Commands — verify
| Package | Tests | Typecheck |
|---|---|---|
| `server` | unit: `pnpm exec vitest run --exclude '**/*.it.test.ts'` · integration (needs Docker): `pnpm exec vitest run .it.test` · both: `pnpm test` | `pnpm typecheck` |
| `client` | `pnpm test` | `pnpm typecheck` |
| `reviewer-core` | `npm test` | `npm run build` (type-check only, emits nothing) |
| `e2e` | `./scripts/e2e.sh` from the repo root (isolated fresh stack on 5433/3101/3100; first run: `cd e2e && npm install`, plus `npm i -g agent-browser && agent-browser install`) | — |

**There is no linter or formatter** — no package defines a `lint` script; typecheck + tests are the gate. Don't add one unasked.

## Naming conventions
- **Files & folders**
  - Route-local components: `client/src/app/**/_components/<PascalName>/` containing `<PascalName>.tsx`, `index.ts` (re-export), optional `styles.ts` (`s` object), `constants.ts`, `helpers.ts`, `<PascalName>.test.tsx`. Sub-components nest as `<Parent>/_components/<Child>/`.
  - Shared client components: `client/src/components/<kebab-name>/` (e.g. `run-cost-badge/`, `findings-popover/`); plain modules in `client/src/lib/<kebab-name>.ts`.
  - Client hooks: `use<Thing>` exported from `client/src/lib/hooks/<domain>.ts` (`reviews.ts`, `agents.ts`, …).
  - Server feature modules: `server/src/modules/<kebab-name>/routes.ts` (+ `service.ts`, `repository.ts`, `repository/<entity>.repo.ts`, `helpers.ts`); cross-module helpers in `modules/_shared/`.
  - Tests: `*.test.ts(x)` = hermetic unit; `*.it.test.ts` = needs real Postgres (the CI split keys on this suffix). Server tests live in `server/test/`, client tests next to the component.
  - e2e flows: `e2e/specs/NN-kebab-name.flow.json` (run in lexical order).
  - Migrations: `NNNN_<name>.sql`, numbered sequentially and tracked in `meta/_journal.json` (drizzle-kit picks names like `0010_skinny_punisher.sql`) — never rename or renumber.
- **Code**
  - Components & types/Zod schemas: `PascalCase` (`FindingCard`, `FindingPreview`); functions & variables: `camelCase`; module-level constants: `UPPER_SNAKE_CASE` (`LOW_CONFIDENCE_THRESHOLD`).
  - Wire contracts / JSON API fields: `snake_case` (`cost_usd`, `latest_findings`); Drizzle schema properties: `camelCase` mapped to `snake_case` columns (`costUsd: doublePrecision('cost_usd')`).
  - i18n: one namespace file per area `client/messages/en/<camelNamespace>.json`; keys `camelCase`, grouped by component (`prReview.panel.severityFilter`).
  - Server ESM relative imports carry the `.js` extension.

## Conventions (not obvious from code)
- Modules are registered statically in `server/src/modules/index.ts` (no filesystem autoload).
- `@devdigest/shared` (Zod contracts) exists as TWO copies: `server/src/vendor/shared/` (canonical; `reviewer-core` aliases to it) and `client/src/vendor/shared/` (the client's own copy). A contract change must be mirrored into both. The client copy already lags the server on lesson-era files — don't "sync" whole files unasked.
- CI is path-filtered per package; `reviewer-core/**` changes also trigger `server-unit` (server type-checks against its source).
- CI invokes the server test split as `pnpm exec vitest run …` rather than relying on `test:unit` / `test:integration` scripts (`TESTING.md`).
- Reviewer prompts: the DB (`agents.system_prompt`) is the runtime source of truth; `docs/agent-prompts/*.md` are the reviewable originals — change both.
- Lesson scope — L01 (run cost + severity findings) is implemented on branch `lesson-01`; L02–L08 features are intentionally absent — don't add them unasked.

## Workflow — every feature goes through 5 phases
1. **Initiation** — search `docs/` / `specs/` / `INSIGHTS.md`, then the code; list what exists, what's missing, and the traps.
2. **Planning** — write the behaviour spec in the right `specs/` folder (package-local, or root `specs/` when it spans packages) and agree open decisions before coding.
3. **Implementation** — small, testable steps; tests alongside the code.
4. **Validation** — tests + typecheck of every touched package, e2e for user-visible flows, manual check in the running app, code review against standards and the spec.
5. **Completion** — record insights, commit in logical slices, and append a **Delivery log** to the feature's spec: one short entry per phase with links to commits, test/e2e results and review outcomes.

## Recording insights (mandatory, unprompted)
- In **every** task, apply the `engineering-insights` skill yourself (`.claude/skills/engineering-insights/SKILL.md`; in Claude Code invoke it as a skill, other agents read the file) — no need to be asked — the moment a non-obvious finding is confirmed (a silent failure, a surprising constraint, a failed approach and why, a tool quirk), and again when wrapping up a task.
- Write to the `INSIGHTS.md` of the package where the work happened (`client/`, `server/`, `reviewer-core/`, `e2e/`); only genuinely cross-package findings go to the root `INSIGHTS.md`.
- Every entry carries evidence as `path:line` (plus a command or error string when relevant) and the date from `date +%F`. Most tasks produce nothing — that's fine.

## Do-not-touch
- `server/src/db/migrations/` (generated SQL + `meta/` snapshots & journal) — never hand-edit; change the schema and regenerate.
- Lockfiles — `server/pnpm-lock.yaml`, `client/pnpm-lock.yaml`, `reviewer-core/package-lock.json`, `e2e/package-lock.json`: never hand-edit; they change only as a side effect of `pnpm install` / `npm install` when a dependency change is intended.
- `server/src/vendor/shared/` and `client/src/vendor/` — vendored/shared; edit only for a deliberate contract change, mirrored into both copies.
- `server/clones/` — runtime checkouts, not source. `e2e/test-results/` — failure screenshots.

## Use when
- Full architecture, env, troubleshooting, lesson roadmap → read `README.md`
- Test lanes and CI layout → read `TESTING.md`
- Working inside a package → read that package's AGENTS.md: `server/AGENTS.md`, `client/AGENTS.md`, `reviewer-core/AGENTS.md`, `e2e/AGENTS.md`
- Agent prompt templates, prompt assembly, output schema, scoring → read `docs/agent-prompts/`
- Cross-package behaviour specs → read `specs/` · cross-package findings → read/append `INSIGHTS.md`
- Before publishing work (push, PR create/merge) → the `pr-self-review` skill gates it; a `PreToolUse` hook blocks the command until that exact diff has a PASS. Spec: `specs/pr-self-review-skill.md`
- Project skills catalog (Fastify, Drizzle, Next, Zod, …) → read `.claude/skills/README.md` (each `SKILL.md` is plain markdown any agent can follow)
