# Onion Architecture skill for server modules: plan and sources

> Research from 2026-09-19. This is a plan only; the skill hasn't been created yet.
> Proposed skill: `.claude/skills/onion-architecture/`, scope **Backend** (`server/`, plus `reviewer-core/` as the pure core).
> It answers one question: *"Which ring does this piece of backend code belong to, what may it import, and how do I keep it there?"*
>
> Priority: **A** means primary or canonical, and rules come from here. **B** means strong author experience, used for reasoning. **C** means reference or examples.
> Every link below returned HTTP 200 on 2026-09-19, except where marked.

---

## 1. What we already have (the baseline the skill must lock in)

DevDigest's server already follows ports and adapters in part. The skill should name what exists, not invent a new structure.

| Onion ring | What it is in DevDigest today | Evidence |
|---|---|---|
| **Domain model (core)** | Wire contracts and types in `@devdigest/shared`; pure module logic (`helpers.ts`, `constants.ts`, `findings.ts`); the whole of `reviewer-core` (diff → prompt → LLM → grounding, with no DB, GitHub or FS) | `server/src/vendor/shared/contracts/`, `reviewer-core/AGENTS.md` |
| **Domain services / ports** | Port interfaces `LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`, `AuthProvider`, `SecretsProvider` | `server/src/vendor/shared/adapters.ts:82-281` |
| **Application services** | `modules/<m>/service.ts`, `reviews/run-executor.ts`: use-case orchestration | `server/src/modules/agents/service.ts:51` |
| **Infrastructure (outer ring)** | Driving side: Fastify `routes.ts`. Driven side: `repository.ts` (Drizzle) and `src/adapters/*` (octokit, simple-git, openai, anthropic, ripgrep, tiktoken, dependency-cruiser). Composition root: `platform/container.ts` | `server/src/platform/container.ts:34-60` |

### Current deviations (a baseline, not a to-do list; don't refactor them unasked)

| # | Deviation | Where |
|---|---|---|
| D1 | Route handlers query Drizzle directly (no repository or service) | `modules/pulls/routes.ts` (359 lines), `polling/routes.ts`, `workspace/routes.ts`, `settings/routes.ts` |
| D2 | An application service imports the DB schema and row types | `modules/reviews/run-executor.ts:5-6`, `reviews/service.ts:4` |
| D3 | Services take the whole `Container` (a service locator) instead of narrow ports | `agents/service.ts:54`, `repos/service.ts:37`, `reviews/service.ts:34` |
| D4 | Services build their own repository instead of receiving it: `new XRepository(container.db)` | `agents/service.ts:55`, `repos/service.ts:37`, `reviews/service.ts:34` |
| D5 | Infrastructure adapters depend on module internals or the DB seed | `adapters/astgrep/index.ts:25` → `modules/repo-intel/constants`; `adapters/auth/local.ts:3-5` → `db/schema`, `db/seed` |
| D6 | One module imports another module's internals | `modules/repos/service.ts:14` → `../repo-intel/constants.js` |
| D7 | The composition root imports concrete module classes. **This is fine:** the composition root is the one place allowed to know everything, and the skill should say so explicitly | `platform/container.ts:26-29` |

---

## 2. Proposed skill layout

Mirror `frontend-architecture/`, which already exists and has the same kind of scope:

```
.claude/skills/onion-architecture/
├── SKILL.md          the rings, the dependency rule, per-tool rules, review checklist (~180 lines)
├── examples.md       before/after from real DevDigest code (D1–D6)
├── references.md     the links from section 5 below, grouped (for the README)
└── CHANGELOG.md
```

Frontmatter `description` (a draft, for triggering): *"Where backend code lives and which way dependencies point in the DevDigest server (Fastify 5 + Drizzle + Zod + LLM/GitHub adapters). Use when creating or reviewing a server module, route, service, repository, or adapter; when a handler touches the DB or an SDK directly; when adding a port or adapter; when deciding what a service may import. Not for Fastify API mechanics (fastify-best-practices), Drizzle query syntax (drizzle-orm-patterns), or schema design (postgresql-table-design)."*

Neighbours to link to rather than duplicate: `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `postgresql-table-design`, `security`, `typescript-expert`, and the user-level `codebase-design` (deep modules, seams).

---

## 3. What goes into `SKILL.md`

### 3.1 The map: rings mapped onto real paths
An ASCII onion plus a table covering: ring → folder/file pattern → allowed imports → forbidden imports.

### 3.2 The dependency rule (the core of the skill)
Rule: *"source code dependencies point inward only"* (Uncle Bob, Palermo). As an import matrix:

| From ↓ may import → | shared contracts | domain (helpers, reviewer-core) | ports (`adapters.ts`) | service | repository / adapters | fastify / drizzle / SDKs | container |
|---|---|---|---|---|---|---|---|
| **domain** (pure) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **service** | ✅ | ✅ | ✅ | ✅ (same module) | ⚠️ port type only | ❌ | ⚠️ baseline D3 |
| **routes** (driving adapter) | ✅ | ✅ | — | ✅ | ❌ | fastify only | `getContext` only |
| **repository** (driven adapter) | ✅ | ✅ | — | ❌ | — | drizzle only | ❌ |
| **src/adapters/*** | ✅ | ✅ | implements | ❌ | — | its own SDK only | ❌ |
| **platform/container.ts** | everything (composition root) |

### 3.3 Per-tool rules (stack-specific; best practices that support the onion)

**Fastify 5 (driving adapter).**
- A route handler is thin. It parses input through the Zod type provider (never a hand-rolled `.parse()`, per `server/AGENTS.md`), calls `getContext`, calls one service method, and returns a DTO.
- No business `if`s, no `container.db`, no SDK calls inside a handler.
- A module is a plugin, registered statically in `modules/index.ts`. Rely on encapsulation: don't use `fastify-plugin` to leak module internals to the whole app.
- Map domain errors (`platform/errors.ts`) to HTTP in one `setErrorHandler`. Services throw domain errors and never set an HTTP status.
- Test routes with `app.inject()`, not a real port.

**Zod / fastify-type-provider-zod (the boundary).**
- "Parse, don't validate": parse at the edge only (route schema, adapter response, env). Inside the core, trust the types.
- Keep wire DTOs (`snake_case`, `@devdigest/shared`) separate from DB rows (`camelCase`, Drizzle). The mapper (`toXDto`) lives in the module's `helpers.ts`, as it does today.
- Parse external SDK/LLM output with Zod inside the adapter (reviewer-core's structured output already does this).

**Drizzle ORM + postgres.js (driven adapter).**
- `drizzle-orm` and `db/schema` are imported only from `repository.ts` / `repository/*.repo.ts` (and `db/`).
- A repository returns rows or domain types; it never returns a query builder or `SQL` fragments.
- Aim for one repository per aggregate/entity (`reviews/repository/{review,pull,run}.repo.ts` is already the pattern).
- The **service** owns the transaction boundary (it knows the use case). Pass `tx` into repository methods, or use a unit-of-work helper, depending on decision O4.
- `$inferSelect` row types stay in the persistence ring (`db/rows.ts`). A service needs a domain/DTO type or a port-level type.

**LLM, GitHub, Git, code index (openai, @anthropic-ai/sdk, octokit, simple-git, ripgrep, ast-grep, tiktoken, dependency-cruiser).**
- Every external SDK sits behind a port in `@devdigest/shared/adapters.ts` and is implemented in `src/adapters/<kind>/`.
- An adapter is an anti-corruption layer. It maps SDK types and errors to domain types and errors, so SDK types never leak past the adapter.
- An adapter never imports `modules/*` (fixes D5). Shared constants move into the adapter or into shared.
- Construct adapters only in `container.ts`. Resolve secrets through `SecretsProvider`, never `process.env`.
- `reviewer-core` is the reference example of a pure core with an injected `LLMProvider`.

**Jobs / SSE / p-queue (`platform/jobs.ts`, `platform/sse.ts`).**
- These are infrastructure. A service reaches them through a narrow interface (`enqueue`, `publish`), and a job handler is a driving adapter that calls a service.

**Config & secrets.** Read `config.ts` and `SecretsProvider` only in the outer ring and the container; pass values into services.

**Time, UUIDs, randomness (optional, see O6).** Pure domain functions take `now` or an id as a parameter (functional core / impureim sandwich).

### 3.4 How to write a new module (a recipe)
`routes.ts` → `service.ts` → `repository.ts` → (`helpers.ts` pure, `constants.ts`) → register in `modules/index.ts` → wire in `container.ts` if another module needs it. Cross-module reuse goes through the container or shared, never `../other-module/`.

### 3.5 Testing by ring (Khorikov + the repo's `TESTING.md`)
| Ring | Test type | Doubles |
|---|---|---|
| domain / helpers / reviewer-core | `*.test.ts`, pure | none |
| service | `*.test.ts` with `ContainerOverrides` + `adapters/mocks.ts` | mock only **unmanaged** dependencies (LLM, GitHub); the DB is managed, so exercise it in `.it` tests |
| repository | `*.it.test.ts` (testcontainers Postgres) | none |
| routes | `app.inject()` | service mocked or real |

### 3.6 Review checklist (for `/code-review` and self-review)
A grep-able list, for example: `grep -l "drizzle-orm" src/modules/*/routes.ts src/modules/*/service.ts` must return nothing in new code; `grep -rn "modules/" src/adapters` must return nothing; no `process.env` outside `config.ts`/secrets; no `from '../<other-module>/`.

### 3.7 Anti-patterns + "when NOT to apply the onion"
- The anemic "pass-through service" for pure CRUD. Palermo and Sairyss both warn that the full onion is overkill for simple CRUD. Rule: a route may call a repository-backed service with trivial methods, but **not** Drizzle directly.
- Don't introduce DDD entities, aggregates or a CQRS bus unasked (lesson scope, per `AGENTS.md`).
- Don't create a port for something with one implementation that is never swapped or mocked (AHA).

---

## 4. `examples.md`: before/after drawn from real code
1. `pulls/routes.ts` (D1): a handler with Drizzle → `PullsRepository` + `PullsService`, and a thin route.
2. `reviews/run-executor.ts` (D2): drop the `db/schema` import; the repository returns what's needed.
3. `agents/service.ts` (D3/D4): `constructor(container)` → `constructor({ repo, llm })`, wired in the container.
4. `adapters/astgrep` (D5): the constant moves out of `modules/repo-intel`.
5. A new port + adapter + mock in `adapters/mocks.ts`, end to end.
6. A transaction owned by a service across two repositories.

---

## 5. Sources (for `references.md` and the skills README)

### 5.1 Onion Architecture: the originals
| # | Source | What to take | Priority |
|---|---|---|---|
| 1 | [Jeffrey Palermo: The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) | The original: domain model at the centre, repository interfaces in the core, implementations outside; "all coupling is toward the center"; not for small sites | A |
| 2 | [Palermo: part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) | Code sample: core vs infrastructure projects | B |
| 3 | [Palermo: part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) | Dependency resolution and wiring at the edge (the composition root) | B |
| 4 | [Palermo: part 4, after four years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/) | The four tenets, restated with hindsight | A |
| 5 | [Herberto Graça: Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) | A clear retelling: layers, the direction of dependencies, how it relates to hexagonal | A |
| 6 | [Herberto Graça: DDD, Hexagonal, Onion, Clean, CQRS… how I put it all together](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) | "Explicit architecture": driving vs driven adapters, application vs domain services, components | A |

### 5.2 Related architectures (the same dependency rule)
| # | Source | What to take | Priority |
|---|---|---|---|
| 7 | [Alistair Cockburn: Hexagonal (Ports & Adapters) Architecture](https://alistair.cockburn.us/hexagonal-architecture/) | Ports and adapters; the app is equally drivable by tests; primary vs secondary ports | A |
| 8 | [Robert C. Martin: The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) | The Dependency Rule; don't pass outer-ring data formats inward | A |
| 9 | [Microsoft Learn: Common web application architectures (Clean/Onion)](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures) | ApplicationCore / Infrastructure / UI; interfaces in the core, implementations in infrastructure | A |
| 10 | [Microsoft Learn: Designing a DDD-oriented microservice](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice) | Domain / application / infrastructure layers and what each may reference | B |
| 11 | [martinfowler.com: Badri Janakiraman, Hexagonal architecture](https://martinfowler.com/articles/badri-hexagonal/) | A pragmatic hexagonal example | B |
| 12 | [Martin Fowler: PresentationDomainDataLayering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) | Layering as a way to narrow attention; layers inside feature modules, not across them | B |

### 5.3 Pure core and dependency direction
| # | Source | What to take | Priority |
|---|---|---|---|
| 13 | [Gary Bernhardt: Functional Core, Imperative Shell](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell) · [Boundaries (talk)](https://www.destroyallsoftware.com/talks/boundaries) | Decisions in pure functions, I/O in a thin shell; tests without doubles | A |
| 14 | [Mark Seemann: Dependency rejection](https://blog.ploeh.dk/2017/02/02/dependency-rejection/) · [Impureim sandwich](https://blog.ploeh.dk/2020/03/02/impureim-sandwich/) | Read → pure decide → write; the shape of a service method | A |
| 15 | [Alexis King: Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) | Parse at the boundary, carry typed evidence inward (Zod) | A |

### 5.4 Patterns inside the rings
| # | Source | What to take | Priority |
|---|---|---|---|
| 16 | [Fowler, PoEAA: Repository](https://martinfowler.com/eaaCatalog/repository.html) | A collection-like interface over persistence | A |
| 17 | [Fowler, PoEAA: Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html) | The application boundary; operations and transaction coordination | A |
| 18 | [Fowler, PoEAA: Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html) | Transaction scope across repositories (decision O4) | B |
| 19 | [Martin Fowler: Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html) | The counterpoint: when the service layer is just a pass-through | B |
| 20 | [Martin Fowler: Bounded Context](https://martinfowler.com/bliki/BoundedContext.html) | Why modules don't reach into each other's internals (D6) | C |
| 21 | [Microsoft Learn: Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design) | Repositories per aggregate; repository vs unit of work | B |

### 5.5 Node.js / TypeScript practice
| # | Source | What to take | Priority |
|---|---|---|---|
| 22 | [Khalil Stemmler: Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/) | Onion/clean mapped onto a Node + TS project | A |
| 23 | [Khalil Stemmler: DTOs, Mappers & the Repository pattern](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) | DTO ↔ domain ↔ persistence mappers (our `toXDto`) | A |
| 24 | [Khalil Stemmler: Use DTOs to enforce a layer of indirection](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/use-dtos-to-enforce-a-layer-of-indirection/) | Don't leak DB rows into the API | B |
| 25 | [Sairyss: domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon) | A big TS reference; also its own warning that it's overkill for CRUD | B |
| 26 | [Sentry: Atomic repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/) | Transactions across repositories without leaking the ORM into services | A (for O4) |
| 27 | [goldbergyoni: Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices) | "Structure by components, layer the components, keep Express/Fastify within its boundaries" | B |

### 5.6 Stack documentation (official)
| # | Source | What to take | Priority |
|---|---|---|---|
| 28 | [Fastify: Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) · [Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) | A module is a plugin; register order | A |
| 29 | [Fastify: Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) · [fastify-plugin](https://github.com/fastify/fastify-plugin) | Scope isolation between modules; when `fastify-plugin` breaks it | A |
| 30 | [Fastify: Decorators](https://fastify.dev/docs/latest/Reference/Decorators/) | Why we use the container, not decorators, for DI (keep it consistent) | B |
| 31 | [Fastify: Errors](https://fastify.dev/docs/latest/Reference/Errors/) | One `setErrorHandler`: domain error → HTTP | A |
| 32 | [Fastify: Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) · [Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/) · [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod) | Validation at the edge via route schemas | A |
| 33 | [Fastify: Testing (`inject`)](https://fastify.dev/docs/latest/Guides/Testing/) | Testing the driving adapter without a network | A |
| 34 | [Drizzle: Transactions](https://orm.drizzle.team/docs/transactions) | `db.transaction(tx => …)`; passing `tx` to repositories | A |
| 35 | [Drizzle: Type API / goodies (`$inferSelect`)](https://orm.drizzle.team/docs/goodies) · [Schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration) | Row types belong to persistence | B |
| 36 | [Zod](https://zod.dev/) | Parsing at the boundary | A |
| 37 | [Testcontainers for Node.js](https://node.testcontainers.org/) | Real Postgres for `*.it.test.ts` repositories | B |
| 38 | [octokit.js](https://github.com/octokit/octokit.js) · [p-queue](https://github.com/sindresorhus/p-queue) | SDKs wrapped by adapters / JobRunner | C |

### 5.7 Testing by ring
| # | Source | What to take | Priority |
|---|---|---|---|
| 39 | [Vladimir Khorikov: Don't mock your database, it's an implementation detail](https://vkhorikov.medium.com/dont-mock-your-database-it-s-an-implementation-detail-8f1b527c78be) (Medium blocks bots with 403; opens in a browser) | Managed vs unmanaged dependencies; mock only the unmanaged ones | A |
| 40 | [Vladimir Khorikov: Mocking types that you own](https://khorikov.org/posts/2020-06-15-mocking-types-that-you-own/) | Mock the port, not the SDK | A |
| 41 | [goldbergyoni: Node.js testing best practices](https://github.com/goldbergyoni/nodejs-testing-best-practices) | Component tests through the API with a real DB | B |

### 5.8 Enforcement
| # | Source | What to take | Priority |
|---|---|---|---|
| 42 | [dependency-cruiser: rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | `forbidden` rules for the import matrix. **Already a server dependency** (used by repo-intel), so no new package is needed | B (see O5) |

---

## 6. Open decisions (to agree before writing the skill)

| # | Question | Options | Recommendation |
|---|---|---|---|
| O1 | Strictness | (a) new and touched code only; (b) also refactor D1–D6 | **(a)**: record D1–D6 as the known baseline; boy-scout rule when touching a file |
| O2 | Folders per module | (a) keep flat `routes/service/repository/helpers`; (b) add `domain/`, `application/`, `infrastructure/` subfolders | **(a)**: the ring is decided by file role, not by folder; this matches existing naming in `AGENTS.md` |
| O3 | Service dependencies | (a) keep `constructor(container)`; (b) narrow deps `{ repo, llm, … }` wired in the container | **(b) for new services**; existing ones stay (D3) |
| O4 | Transactions | (a) the service passes `tx` into repository methods; (b) a unit-of-work helper in `platform/` | **(a)**: simpler, and it's Drizzle-native |
| O5 | Automated check | (a) checklist + grep only; (b) a `.dependency-cruiser.cjs` config + script | **(a)** for now: `AGENTS.md` says don't add a linter unasked. (b) is a separate decision for you |
| O6 | Clock / UUID injection into pure functions | (a) mandatory; (b) recommended | **(b)** |
| O7 | Should `reviewer-core` be in the skill's scope | (a) as the reference "pure core" only; (b) with its own rules | **(a)** |

## 7. Related updates after the skill is written
- A row in `.claude/skills/README.md` (catalog), plus the links from section 5.
- A pointer in `server/AGENTS.md` → "Use when".
- A delivery log in the skill's spec (per the 5-phase workflow in `AGENTS.md`).
