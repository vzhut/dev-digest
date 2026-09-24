# Routing: which skill reviews which file

`scripts/route.sh` implements this table. This file explains *why* each row exists, so the
routing can be argued with instead of guessed at. If you change one, change both.

## Client (`group: ui`)

| Pattern | Skills | Why |
|---|---|---|
| `client/**/*.tsx` | `frontend-architecture`, `react-best-practices`, `typescript-expert` | Placement and splitting come from the first; render-time and hook bugs from the second |
| `client/src/app/**` | + `next-best-practices` | Only App Router files have RSC boundaries, `'use client'`, metadata, `error`/`not-found` conventions. Applying it to every component file produces noise about rules that can't apply |
| `client/src/lib/**`, `client/src/components/**` | `frontend-architecture`, `typescript-expert` | These are the promotion targets: the question is usually "does this deserve to be shared, and does it belong here" |
| `client/**/*.test.tsx` | `react-testing-library` | Query priority, `userEvent`, async patterns. Architecture rules about tests are in `frontend-architecture` §11 item 10 |
| `client/messages/en/*.json` | `frontend-architecture` (i18n rules only) | Namespace-per-area, `camelCase` keys grouped by component. Nothing else in the catalog has anything to say about a message file |

## Server and reviewer-core (`group: backend`)

| Pattern | Skills | Why |
|---|---|---|
| `server/src/modules/**`, `adapters/**`, `platform/**`, `reviewer-core/src/**` | `onion-architecture`, `typescript-expert` | The ring a file belongs to is decided by its role, which is exactly what this skill encodes |
| `**/routes.ts`, `server/src/platform/**` | + `fastify-best-practices` | Hooks, plugin scope, schema validation, error handling — only routes and the platform wiring touch these |
| `**/repository*.ts`, `*.repo.ts`, `server/src/db/**` | + `drizzle-orm-patterns` | Query syntax, relations, transactions. Deliberately not applied to services: a service that needs Drizzle advice already has an onion problem |
| `server/src/db/schema/**`, `db/migrations/**` | + `postgresql-table-design` | Types, indexes, constraints, nullability |

## Cross-cutting

| Condition | Skill | Why |
|---|---|---|
| File imports `zod`, or lives under `vendor/shared/` | `zod` | Boundary parsing, `safeParse`, inference. Every wire contract in this repo is a Zod schema |
| `routes.ts`, `adapters/**`, `platform/**`, or the file contains `dangerouslySetInnerHTML`, `child_process`, `exec(`, `spawn(`, `simple-git`, `process.env`, `sql.raw` | `security` | A security read earns its cost where an attack path can exist: outside input, process execution, secrets, HTML injection. Read it with the stack mapping below |
| Everything else (`e2e/**`, `docs/**`, `specs/**`, `.claude/**`) | none (`rules-only`) | The deterministic gates still apply; no stack skill has rules for these |

### Reading `security` against this stack

The skill is written for Express + MongoDB + JWT. Map it before quoting it:

| Skill says | Here it means |
|---|---|
| Express middleware / route handler | Fastify route + hooks, `server/src/modules/*/routes.ts` |
| NoSQL / operator injection | raw SQL via `sql.raw` or string-built Drizzle fragments |
| JWT handling | `server/src/adapters/auth/local.ts` and workspace scoping |
| `dangerouslySetInnerHTML` | same, plus `react-markdown` rendering GitHub-authored PR text |
| Secrets management | `platform/config`, the secrets port, `.env` |

### `typescript-expert`

Apply its "Code Review Checklist" section only, and never raise CRITICAL from it alone. It is
a general TypeScript guide with no knowledge of this codebase; used in full it out-reports every
project-specific skill and buries the findings that matter.

## Skills deliberately not routed

`mermaid-diagram` and `engineering-insights` produce artefacts, they don't judge code.
`engineering-insights` still applies to the *session* — if the review uncovers something
non-obvious, record it as that skill describes. That's separate from the verdict.
