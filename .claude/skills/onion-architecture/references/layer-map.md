# Layer map: every `server/src` file by ring

Read this when you need the ring of a **specific existing file**, or you want to know whether one file may import another.
The rules are in [SKILL.md](../SKILL.md) §1–§2. This file is the inventory those rules are checked against.

Snapshot: 2026-09-19, skill v1.1.0. Built from each file's `import` lines. When a module or file is added, add it here
too (PATCH bump).

Legend: ✅ follows the dependency rule · ⚠️ known deviation (see SKILL.md §8; don't copy it, and fix it only when you touch it)

## Contents
- [Rings at a glance](#rings-at-a-glance)
- [modules/](#modules)
- [platform/](#platform)
- [adapters/](#adapters)
- [Outside server/src](#outside-serversrc)
- [Allowed-import quick lookup](#allowed-import-quick-lookup)

## Rings at a glance

| Ring | Files (pattern) | Depends on |
|---|---|---|
| 1 · Domain (pure) | `@devdigest/shared` contracts, `modules/*/{helpers,constants,status,findings}.ts`, `modules/_shared/schemas.ts`, pure `platform/*` (below), `@devdigest/reviewer-core` | ring 1 only |
| 2 · Ports | `vendor/shared/adapters.ts`, `modules/repo-intel/types.ts`, the interfaces in `adapters/{depgraph,tokenizer}/index.ts` | ring 1 |
| 3 · Application | `modules/*/service.ts`, `reviews/run-executor.ts`, `reviews/diff-loader.ts`, `repo-intel/pipeline/{full,incremental}.ts` | rings 1–2 (+ `import type` from `db/rows.ts`) |
| 4 · Infrastructure | `modules/*/routes.ts`, `modules/*/repository.ts`, `repository/*.repo.ts`, `adapters/**`, infra `platform/*`, `db/**`, `app.ts`, `server.ts` | anything inward |
| Composition root | `platform/container.ts` | everything |

## modules/

| File | Ring | Status | Note |
|---|---|---|---|
| `index.ts` | 4 (wiring) | ✅ | static plugin registry |
| `_shared/context.ts` | 4 (driving helper) | ✅ | `FastifyRequest` + `Container` → `RequestContext`; routes only |
| `_shared/schemas.ts` | 1 | ✅ | Zod `IdParams` |
| `_shared/finding-previews.ts` | 4 (driven) | ⚠️ D2b | a Drizzle query helper that lives in `_shared/`; name new ones `*.repo.ts` |
| `agents/routes.ts` | 4 (driving) | ✅ | the reference shape for a thin handler |
| `agents/service.ts` | 3 | ⚠️ D3/D4 | `constructor(container)`, `new AgentsRepository` |
| `agents/repository.ts` | 4 (driven) | ✅ | |
| `agents/helpers.ts` | 1 | ✅ | `import type` of rows via `./repository.js` (re-exported from `db/rows.ts`) |
| `agents/constants.ts` | 1 | ✅ | |
| `polling/routes.ts` | 4 (driving) | ⚠️ D1 | Drizzle in the handler; no service or repository |
| `pulls/routes.ts` | 4 (driving) | ⚠️ D1 | ~20 Drizzle calls + GitHub sync in handlers; see examples.md §1 |
| `pulls/status.ts` | 1 | ✅ | `deriveReviewStatus`, a pure function |
| `repo-intel/routes.ts` | 4 (driving) | ✅ | |
| `repo-intel/service.ts` | 3 | ✅ | a facade behind the `RepoIntel` port, built in the container |
| `repo-intel/types.ts` | 2 | ✅ | the `RepoIntel` port |
| `repo-intel/repository.ts` | 4 (driven) | ✅ | |
| `repo-intel/constants.ts` | 1 | ✅ | but imported by an adapter (D5) and by `repos/` (D6) |
| `repo-intel/index.ts` | — | ✅ | re-exports |
| `repo-intel/pipeline/full.ts`, `incremental.ts` | 3 | ⚠️ D9 | import concrete `adapters/astgrep` + `adapters/codeindex/extract` instead of a port |
| `repo-intel/pipeline/rank.ts` | 1 | ✅ | pure graph math (graphology) + row types |
| `repo-intel/pipeline/repo-map.ts`, `walk.ts` | 1 / 4 | ✅ | `walk.ts` reads the FS (infra helper used by the pipeline) |
| `repos/routes.ts` | 4 (driving) | ✅ | |
| `repos/service.ts` | 3 | ⚠️ D3/D4/D6 | imports `../repo-intel/constants.js` |
| `repos/repository.ts` | 4 (driven) | ✅ | |
| `repos/helpers.ts` | 1 | ⚠️ D2 | imports `db/schema` |
| `repos/constants.ts` | 1 | ✅ | |
| `reviews/routes.ts` | 4 (driving) | ✅ | |
| `reviews/service.ts` | 3 | ⚠️ D3/D4 | `import type { AgentRow }` from `db/rows.ts` is fine |
| `reviews/run-executor.ts` | 3 | ⚠️ D2/D3 | `db/schema` used only for a row type; see examples.md §2 |
| `reviews/diff-loader.ts` | 3 | ⚠️ D2 | imports `db/schema`; uses `adapters/git/diff-parser` (a pure parser, tolerated) |
| `reviews/findings.ts` | 1/3 | ✅ | takes `ReviewRepository` as a type |
| `reviews/helpers.ts` | 1 | ✅ | |
| `reviews/constants.ts` | 1 | ✅ | |
| `reviews/repository.ts` + `repository/{pull,review,run}.repo.ts` | 4 (driven) | ✅ | the reference shape for splitting a repository per entity |
| `settings/routes.ts` | 4 (driving) | ⚠️ D1 | Drizzle in the handler |
| `settings/feature-models.ts` | 3 | ⚠️ D2 | Drizzle + `Container` |
| `settings/helpers.ts`, `constants.ts` | 1 | ✅ | |
| `workspace/routes.ts` | 4 (driving) | ⚠️ D1 | Drizzle in the handler |

## platform/

`platform/` holds both rings. Check the imports, not the folder.

| File | Ring | Why |
|---|---|---|
| `errors.ts` | 1 | the domain error taxonomy (the HTTP `statusCode` is tolerated, D8) |
| `grounding.ts`, `model-router.ts`, `prompt.ts`, `resilience.ts`, `structured.ts`, `trace-builder.ts`, `price-book.ts` | 1 | no I/O imports: pure functions over shared types |
| `config.ts` | 4 | reads env; the only place outside `db/*` scripts and adapters that may touch `process.env` |
| `prompts.ts` | 4 | reads prompt files from disk |
| `jobs.ts` | 4 | p-queue + Drizzle job table |
| `sse.ts`, `run-logger.ts` | 4 | in-process event bus, used by services through a narrow API |
| `container.ts` | root | builds every adapter and shared repository; allowed to import `modules/*` (D7) |

## adapters/

Every file here is ring 4 (driven). Each one depends only on its SDK and the port it implements.

| File | Implements | Status |
|---|---|---|
| `llm/openai.ts`, `llm/anthropic.ts` | `LLMProvider` | ✅ |
| `llm/pricing.ts` | pure price table | ✅ |
| `embedder/openai.ts` | `Embedder` | ✅ |
| `github/octokit.ts` | `GitHubClient` | ✅ |
| `git/simple-git.ts` | `GitClient` | ✅ (sets `process.env.GIT_*` for subprocesses; fine inside an adapter) |
| `git/diff-parser.ts` | pure unified-diff parser | ✅ |
| `codeindex/ripgrep.ts`, `codeindex/extract.ts` | `CodeIndex` / extractors | ✅ |
| `astgrep/index.ts` | symbol/reference parser | ⚠️ D5, imports `modules/repo-intel/constants` |
| `depgraph/index.ts` | `DepGraph` (local port + dependency-cruiser impl) | ✅ |
| `tokenizer/index.ts` | `Tokenizer` (local port + tiktoken impl) | ✅ |
| `secrets/local.ts` | `SecretsProvider` | ✅ (reads env as a fallback; this is the one place that should) |
| `auth/local.ts` | `AuthProvider` | ⚠️ D5, imports `db/schema`, `db/seed` |
| `mocks.ts` | test doubles for every port | ✅ |
| `index.ts` | re-exports | ✅ |

## Outside server/src

| Path | Ring |
|---|---|
| `server/src/vendor/shared/contracts/*` | 1, the wire types (mirrored in `client/src/vendor/shared/`) |
| `server/src/vendor/shared/adapters.ts` | 2, the ports |
| `reviewer-core/src/**` | 1, a pure review engine with an injected `LLMProvider`; the model for "pure core" |
| `server/src/db/{schema,rows,client}.ts` | 4, persistence (`rows.ts` types may be `import type`-ed by ring 3) |

## Allowed-import quick lookup

```
routes.ts        → service.ts, helpers.ts, constants.ts, _shared/{context,schemas}.ts, @devdigest/shared, platform/errors.ts, fastify, zod
service.ts       → repository.ts (the class, received or built), helpers.ts, constants.ts, ports, @devdigest/shared,
                   platform/{errors,pure}.ts, import type from db/rows.ts
repository.ts    → drizzle-orm, db/{schema,client,rows}.ts, helpers.ts (pure mappers), @devdigest/shared
helpers.ts       → constants.ts, @devdigest/shared, pure platform/*, import type rows
adapters/<kind>/ → its SDK, @devdigest/shared, platform/errors.ts, its own files
container.ts     → anything
✗ never          → modules/A → modules/B/* · adapters → modules/* or db/* · anything inward → fastify/drizzle/SDK types
```
