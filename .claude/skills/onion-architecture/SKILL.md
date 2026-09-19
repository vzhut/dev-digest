---
name: onion-architecture
description: "Onion Architecture (ports & adapters) for the DevDigest server (server/src: Fastify 5, Drizzle, Zod, LLM/GitHub/Git adapters; reviewer-core is the pure core). Use this whenever you add or change a server module, route, service, repository, adapter, port, job handler or pure helper and must decide which file it belongs in and what it may import; when a route handler touches container.db, drizzle-orm or an SDK directly; when a service grows or needs a new dependency; when adding an LLM/GitHub/Git integration; when deciding where a transaction, a DTO mapping, a domain error or a Zod parse goes; and when reviewing a server change for layering. Use it even without the words 'onion'/'hexagonal'/'clean architecture': any 'where should this backend code go', 'this handler is too fat' or 'how do I add a new endpoint/module' in server/ qualifies. Not for Fastify API mechanics (fastify-best-practices), Drizzle query syntax (drizzle-orm-patterns), tables (postgresql-table-design) or client code (frontend-architecture)."
metadata:
  version: 1.1.0
  updated: 2026-09-19
  stack: fastify@5, drizzle-orm@0.38, zod@3, fastify-type-provider-zod@4, vitest@2
---

# Onion Architecture for the DevDigest server

This skill answers one question: **"Which ring does this backend code belong to, what may it import, and how do I keep it there?"**
All paths are real paths under `server/src`. For before/after examples, see [examples.md](examples.md). For the ring and status of every existing file, see
[references/layer-map.md](references/layer-map.md). For the sources behind each rule, see [references/sources.md](references/sources.md).

Neighbouring skills (link to them rather than repeating them):
- Fastify API mechanics (hooks, plugins, schemas) → `fastify-best-practices`
- Drizzle query syntax, relations, migrations → `drizzle-orm-patterns`
- Tables, indexes, constraints → `postgresql-table-design`
- Zod schema authoring → `zod` · secrets and auth → `security`

**Why bother:** the review engine, cost math and grounding rules are the product. SDKs, the ORM and the HTTP framework are
replaceable details. When dependencies point inward, the product logic can be unit-tested without Postgres or network
access, and an LLM, GitHub or storage change stays inside one adapter.

---

## 1. The rings, mapped to real paths

```
            ┌────────────────────── infrastructure (outer) ──────────────────────┐
            │  driving: modules/<m>/routes.ts · job handlers (jobs.register)     │
            │  driven:  modules/<m>/repository.ts · repository/<entity>.repo.ts  │
            │           src/adapters/<kind>/* (octokit, simple-git, openai, …)   │
            │  wiring:  platform/container.ts (composition root) · app.ts        │
            │   ┌────────────────── application services ──────────────────┐     │
            │   │  modules/<m>/service.ts · reviews/run-executor.ts        │     │
            │   │   ┌──────────────── ports (domain services) ─────────┐   │     │
            │   │   │  vendor/shared/adapters.ts: LLMProvider,         │   │     │
            │   │   │  GitHubClient, GitClient, CodeIndex, Embedder,   │   │     │
            │   │   │  AuthProvider, SecretsProvider · RepoIntel type  │   │     │
            │   │   │   ┌──────────── domain (core) ──────────────┐    │   │     │
            │   │   │   │ @devdigest/shared contracts & types     │    │   │     │
            │   │   │   │ modules/<m>/helpers.ts, constants.ts,   │    │   │     │
            │   │   │   │ findings.ts, status.ts · platform/      │    │   │     │
            │   │   │   │ errors.ts · @devdigest/reviewer-core    │    │   │     │
            │   │   │   └─────────────────────────────────────────┘    │   │     │
            │   │   └──────────────────────────────────────────────────┘   │     │
            │   └──────────────────────────────────────────────────────────┘     │
            └────────────────────────────────────────────────────────────────────┘
```

Identify a file's ring by its **role (file name)**, not by its folder (`platform/` holds both pure and infra files; the
[layer map](references/layer-map.md) classifies each one). Modules stay flat:
`routes.ts / service.ts / repository.ts / helpers.ts / constants.ts`. Don't add `domain/`, `application/` or
`infrastructure/` subfolders. `AGENTS.md` naming already encodes the rings, and a second scheme would split the
codebase in two.

## 2. The dependency rule

> Source-code dependencies point **inward only**. An inner ring never names anything declared in an outer ring:
> no types, no functions, and no data formats.

| From ↓ · may import → | shared contracts | domain (helpers, constants, errors, reviewer-core) | ports | services | repositories / adapters | `fastify` · `drizzle-orm` · `db/schema` · SDKs | `Container` |
|---|---|---|---|---|---|---|---|
| **domain** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **service** | ✅ | ✅ | ✅ | ✅ its own module | via the **port/type** it receives | ❌ (`import type` from `db/rows.ts` tolerated, §4.3) | ⚠️ existing only (§8 D3) |
| **routes.ts** | ✅ | ✅ | — | ✅ its own module | ❌ | `fastify` only | `app.container` → `getContext`, build the service |
| **repository** | ✅ | ✅ | — | ❌ | ❌ | `drizzle-orm`, `db/*` only | ❌ (receives `Db`) |
| **src/adapters/\*** | ✅ | ✅ shared only | implements | ❌ | ❌ | its own SDK only | ❌ |
| **platform/container.ts** | everything. It's the composition root, the one place allowed to know every concrete class |

Three corollaries that catch most violations:
1. **`modules/A` never imports `modules/B/*`.** Cross-module needs go through the container (`container.agentsRepo`,
   `container.repoIntel()`) or move down into `@devdigest/shared` / `modules/_shared/`.
2. **`src/adapters/*` never imports `modules/*` or `db/*`.** An adapter depends only on its SDK and the port it implements.
3. **Outer data formats stay outside.** Octokit payloads, OpenAI responses, Drizzle query builders, `FastifyRequest`
   and `SQL` fragments are never passed into a service or a pure function. Map them at the edge.

## 3. Placement table: "I have X → it goes to Y"

| I have… | Goes to | Ring |
|---|---|---|
| An HTTP endpoint | `modules/<m>/routes.ts`, a thin handler (§4.1) | infra (driving) |
| Request/response shape | Zod schema: wire contract → `@devdigest/shared` (both copies, see `AGENTS.md`); route-only params → top of `routes.ts` or `_shared/schemas.ts` | boundary |
| A use case (import PRs, run review, create agent) | a method on `modules/<m>/service.ts` | application |
| A business rule or calculation (score, status, cost, grouping, diff filtering) | a pure function in `modules/<m>/helpers.ts` (or `findings.ts` / `status.ts` when it's a named concept) | domain |
| A rule reused by 2+ modules | `modules/_shared/<concept>.ts` (pure); a wire type → `@devdigest/shared` | domain |
| Review-engine logic (prompt, grounding, output parsing) | `reviewer-core/` (no DB, no FS, no GitHub) | domain |
| A SQL query / insert / upsert | a method on `modules/<m>/repository.ts` (or `repository/<entity>.repo.ts` once it grows) | infra (driven) |
| A row → DTO mapping (`toAgentDto`) | `modules/<m>/helpers.ts` | domain (pure mapper) |
| Row types (`$inferSelect`) | `db/rows.ts` | persistence |
| A new external system (API, CLI, SDK) | port interface in `vendor/shared/adapters.ts` + impl in `src/adapters/<kind>/<impl>.ts` + mock in `src/adapters/mocks.ts` + lazy getter + override in `platform/container.ts` | port + infra |
| An error the caller should see | throw an `AppError` subclass from `platform/errors.ts` in the service; `app.ts` `setErrorHandler` renders it | domain |
| A background job | `jobs.register(kind, handler)` in the service constructor; the handler only calls a service method | infra (driving) |
| Config / secrets | `platform/config.ts` / `SecretsProvider`, read in the container or an adapter, never in a service or helper | infra |
| A module constant | `modules/<m>/constants.ts` (`UPPER_SNAKE_CASE`) | domain |

## 4. Per-tool rules

### 4.1 Fastify 5: the driving adapter
- A handler does four things: **parse** (the route `schema` via fastify-type-provider-zod), **resolve context**
  (`getContext(app.container, req)`), **call one service method**, and **shape the reply** (status code, DTO).
  Branching on business state, looping over rows, `container.db`, `container.github()` or `try/catch` around SDK calls
  inside a handler means the logic is in the wrong ring.
- Validation comes from the route `schema`, never from a hand-rolled `Schema.parse(req.body)` (`server/AGENTS.md`).
- Build the service once per plugin: `const service = new XService(app.container)`, as in `modules/agents/routes.ts`.
- A module is a Fastify plugin registered statically in `modules/index.ts`. Keep it encapsulated. Don't wrap a module
  in `fastify-plugin` or `decorate` module internals onto the root instance. Only `container` is decorated (`app.ts`).
  DI goes through the container, not Fastify decorators, so the same service works from a route, a job or a test.
- Error → HTTP mapping lives only in `app.ts` `setErrorHandler`. Handlers and services never call `reply.status(4xx)`
  for errors. They throw `NotFoundError` / `ValidationError` / `AppError`.

### 4.2 Zod: parse at the boundary, trust inside
- Parse where untrusted data **enters**: the route schema (HTTP in), the adapter (SDK/LLM responses in; see
  `platform/structured.ts` and reviewer-core's structured output), and config (env in). After that, pass typed values.
  Don't re-validate inside services or helpers.
- Keep wire DTOs (`snake_case`, `@devdigest/shared`) separate from rows (`camelCase`, Drizzle). A pure mapper
  (`toXDto`) in `helpers.ts` converts between them. Don't return raw rows from a route.

### 4.3 Drizzle ORM + postgres.js: the driven adapter
- `drizzle-orm` and `db/schema` value imports belong **only** in `repository.ts`, `repository/*.repo.ts` and `db/*`.
  A service that needs data calls a repository method named after intent (`findPullForWorkspace`, `upsertPulls`),
  not after SQL (`selectWhere`).
- A repository receives `Db` in its constructor and returns rows, DTOs or plain values. It never returns a query builder or
  `SQL` fragment, and it contains no business decisions beyond the query itself.
- Scope every query by `workspaceId`. The repository signature takes it explicitly.
- **Transactions are owned by the service**, because it knows the unit of work. Use `db.transaction(async (tx) => …)` and pass
  `tx` into repository methods that accept `Db | Tx` (Drizzle's `tx` has the same query API). Don't open transactions inside
  a repository method that another use case may need to compose. The codebase has no transactions yet. The first one adds
  `export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]` next to `Db` in `db/client.ts`.
- Services may `import type { PullRow } from '../../db/rows.js'`. `db/rows.ts` exists so modules can share row
  shapes without importing each other's data layer, and a type-only import is erased at build time. They may not import
  `db/schema`, `db/client` values or `drizzle-orm`.

### 4.4 External systems: LLM, GitHub, Git, code index
(`openai`, `@anthropic-ai/sdk`, `octokit`, `simple-git`, `@vscode/ripgrep`, `@ast-grep/napi`, `js-tiktoken`, `dependency-cruiser`)
- Every SDK sits behind a port (`vendor/shared/adapters.ts`, or a local interface such as `DepGraph` / `Tokenizer` in
  `adapters/<kind>/index.ts`). Services depend on the **port type**.
- The adapter is an **anti-corruption layer**. It maps SDK payloads to shared types and SDK failures to `ExternalServiceError`,
  so no SDK type ever appears in a service signature.
- Construct adapters only in `platform/container.ts`, lazily. Credentials come from `SecretsProvider`.
- Every port has a mock in `src/adapters/mocks.ts` and an override slot in `ContainerOverrides`. A port nobody can
  mock is a leak.
- `@devdigest/reviewer-core` is the model to copy: a pure pipeline with the `LLMProvider` injected. Don't give it DB, FS or GitHub access.

### 4.5 Jobs, SSE, time
- `platform/jobs.ts` (p-queue) and `platform/sse.ts` (`runBus`) are infrastructure. A service may call
  `jobs.enqueue` / `runBus.publish`, and a job handler is a driving adapter that forwards to a service method.
- Pure functions take `now: Date` or ids as parameters instead of calling `Date.now()` / `randomUUID()` themselves when the
  result is asserted in tests. Read → decide (pure) → write is the target shape of a service method.

## 5. Recipes

**New module:** `routes.ts` (schemas + thin handlers) → `service.ts` (use cases, transactions, errors) →
`repository.ts` (Drizzle only) → `helpers.ts` (pure rules + DTO mappers) → `constants.ts` → register in
`modules/index.ts`. If another module needs its repository, expose it through a container getter (as with `agentsRepo`).
Don't import it across modules.

**New service constructor (new code):** receive narrow dependencies, not the whole container:
```ts
export class PullsService {
  constructor(private deps: { repo: PullsRepository; github: () => Promise<GitHubClient>; log: FastifyBaseLogger }) {}
}
// routes.ts
const service = new PullsService({ repo: new PullsRepository(app.container.db), github: () => app.container.github(), log: app.log });
```
The constructor then documents exactly what the use case touches, and tests pass mocks without building a `Container`.
If the dependency list passes ~5 entries, the service is doing more than one job.

**New external integration:** port interface → adapter → mock → container getter + override → service depends on the port.
See [examples.md §5](examples.md#5-a-new-port--adapter--mock).

## 6. Testing by ring

| Ring | Test | Doubles |
|---|---|---|
| domain (`helpers.ts`, `findings.ts`, reviewer-core) | `test/<m>-helpers.test.ts`, plain inputs → outputs | none needed; that's the payoff |
| service | `*.test.ts` with mocks from `adapters/mocks.ts` (via `ContainerOverrides` or narrow deps) | mock **unmanaged** deps only (LLM, GitHub, Git). The DB is managed: cover it in `.it` tests instead of mocking repositories |
| repository | `*.it.test.ts` against real Postgres (`test/helpers/pg.ts`) | none |
| routes | `app.inject()` (`test/routes-smoke.test.ts`) | as needed |

## 7. When NOT to add a layer

- A pure CRUD endpoint still gets a repository method and a thin route. The service may be a one-line
  pass-through, and that's fine. The rule being enforced is "no Drizzle in routes", not "every call needs three hops".
- Don't create a port for something that has one implementation, is never mocked and isn't I/O. A pure function is
  already its own seam.
- Don't introduce DDD entities, aggregates, value-object classes, a CQRS bus or a DI framework. The shared Zod types plus pure
  functions are the domain model here.
- Don't refactor existing violations (§8) unless the task touches that code or the user asks.

## 8. Known deviations (baseline: don't copy these, and don't fix them unasked)

| # | Where | Deviation | When you touch it |
|---|---|---|---|
| D1 | `modules/pulls/routes.ts`, `polling/routes.ts`, `workspace/routes.ts`, `settings/routes.ts` | Handlers query Drizzle / call SDKs directly | Move the query you're changing into a repository + service; leave the rest |
| D2 | `reviews/run-executor.ts:5`, `reviews/diff-loader.ts:4`, `repos/helpers.ts:2`, `settings/feature-models.ts` | Non-repository files import `db/schema` / `drizzle-orm` | Replace with a repository method |
| D2b | `_shared/finding-previews.ts` | A shared **query** helper (takes `Db`) in `_shared/` | It's a driven adapter. Name new ones `*.repo.ts`; `_shared/` pure helpers stay DB-free |
| D3 | `agents/service.ts`, `repos/service.ts`, `reviews/service.ts` | `constructor(container: Container)` (service locator) | Keep it for existing classes; new services use narrow deps (§5) |
| D4 | same | Services `new` their own repository | Acceptable while D3 stands |
| D5 | `adapters/astgrep/index.ts:25`, `adapters/auth/local.ts:3-5` | Adapters import `modules/repo-intel/constants`, `db/schema`, `db/seed` | Move constants to the adapter / shared |
| D6 | `repos/service.ts:14` | Imports `../repo-intel/constants.js` | Move the shared constant to `_shared/` or shared |
| D7 | `platform/container.ts:26-29` | Imports module classes | **Not a violation.** Composition root |
| D9 | `repo-intel/pipeline/full.ts`, `incremental.ts` | Application code imports concrete `adapters/astgrep`, `adapters/codeindex/extract` | Put a port in front of them when you touch the pipeline |
| D8 | `platform/errors.ts` | Domain errors carry an HTTP `statusCode` | Tolerated. It keeps one error taxonomy; don't add HTTP concerns beyond it |

## 9. Review checklist

Run from `server/`. On a diff, each command should print nothing for **new or changed** lines:
```bash
grep -nE "from 'drizzle-orm'|db/schema|container\.db" src/modules/*/*.ts | grep -vE "repository|Repository\(container\.db\)"  # D1/D2
grep -rnE "from '\.\./(agents|reviews|repos|pulls|polling|workspace|settings|repo-intel)/" src/modules   # cross-module
grep -rnE "modules/|db/" src/adapters --include='*.ts' | grep import                                      # adapter leaks
grep -rn "process.env" src/modules src/platform --include='*.ts' | grep -v "platform/config"              # config leaks
```
Then by eye:
- [ ] Each handler is parse → context → one service call → reply; no business branching.
- [ ] Every new SDK call is behind a port with a mock in `adapters/mocks.ts` and a `ContainerOverrides` slot.
- [ ] No SDK / Drizzle / Fastify type appears in a service or helper signature.
- [ ] Business rules are pure functions with a unit test; `.it` tests cover new repository methods.
- [ ] Errors are thrown as `AppError` subclasses, not rendered with `reply.status`.
- [ ] Transactions are opened in the service and `tx` is passed down.
- [ ] Nothing from §8 was copied into new code.

Automated enforcement (a `dependency-cruiser` ruleset; the package is already a server dependency) isn't set up.
`AGENTS.md` forbids adding a linter unasked, so treat the grep lines above as the gate.
