# server (@devdigest/api)

## Before answering
Search `server/docs/`, `server/specs/`, `server/INSIGHTS.md` first.

## Conventions (not obvious from code)
- Dependencies come from the DI container (`src/platform/container.ts`) — never construct an adapter inline; tests inject via `ContainerOverrides` + `src/adapters/mocks.ts`.
- Route params/body are Zod schemas from `@devdigest/shared` via fastify-type-provider-zod — never hand-roll `Schema.parse()` in a handler.
- Secrets are read only through `SecretsProvider` — never `process.env` directly.
- A DB-backed test (imports `test/helpers/pg.ts`) must be named `*.it.test.ts` — the CI unit/integration split keys on that suffix alone.
- Schema change = edit `src/db/schema/*` → `pnpm db:generate` → `pnpm db:migrate`. Migrations never run on boot.

## Do-not-touch
- `src/db/migrations/` (generated) · `clones/` (runtime) · `src/vendor/shared/` (ripples into client + reviewer-core)

## Use when
- API map, DI flow, env table → read `server/README.md`
- Where server code goes / what it may import (routes → service → repository, ports & adapters) → use the `onion-architecture` skill (`.claude/skills/onion-architecture/`)
- Deep-dives → read `server/docs/` · behaviour specs → read `server/specs/` · findings → read `server/INSIGHTS.md`
