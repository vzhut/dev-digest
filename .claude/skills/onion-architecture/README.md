# onion-architecture skill

An agent skill that keeps the DevDigest **server** (`server/src`) in Onion Architecture (ports & adapters):
dependencies point inward, the ORM and SDKs stay behind repositories and adapters, and business rules stay pure and unit-testable.

This README is for **people**. Agents load [`SKILL.md`](SKILL.md) automatically from its `description`.

## When it triggers

Claude Code loads the skill when a task adds or changes a server module, route, service, repository, adapter, port,
job handler or pure helper, when it reviews a server change for layering, or when someone asks "where does this backend code go?".
It doesn't trigger for client code (→ `frontend-architecture`), Fastify or Drizzle API syntax (→ `fastify-best-practices`,
`drizzle-orm-patterns`), or table design (→ `postgresql-table-design`).

Invoke it explicitly with `/onion-architecture`. Agents other than Claude Code (Cursor, Codex, Copilot) should read `SKILL.md` as plain markdown.

## What's inside

```
onion-architecture/
├── README.md                 this file (for humans)
├── SKILL.md                  the rules: rings, dependency rule, placement table, per-tool rules,
│                             recipes, testing by ring, known deviations, review checklist
├── examples.md               before/after on real server code (fat route, service locator, adapter leak, new port, transaction)
├── references/
│   ├── layer-map.md          every server/src file → ring → status (✅ / ⚠️ D#), plus an allowed-import lookup
│   └── sources.md            the article or doc behind each rule (the links for this README are below)
├── evals/evals.json          test prompts + assertions for the skill-creator eval loop
└── CHANGELOG.md
```

Progressive disclosure: `SKILL.md` stays under ~250 lines and loads on every trigger. `examples.md` and `references/*`
load only when the agent needs them.

## The rule in one picture

```
routes.ts ─┐                         ┌─ repository.ts ── drizzle-orm / db/schema
job handler┼─▶ service.ts ─▶ ports ◀─┼─ src/adapters/* ── openai / octokit / simple-git / …
           │        │                └─ (implemented by)
           │        ▼
           └──▶ helpers.ts / constants.ts / @devdigest/shared / reviewer-core   (pure core)
                                     wired together only in platform/container.ts
```

## Versioning

The skill uses SemVer in the `SKILL.md` frontmatter (`metadata.version`, `metadata.updated`, `metadata.stack`) plus `CHANGELOG.md`:

| Bump | When | Example |
|---|---|---|
| **MAJOR** | code that followed the skill now doesn't | services must no longer take `Container` |
| **MINOR** | a new rule, section or reference file | adding `references/layer-map.md` |
| **PATCH** | wording, examples, links, layer-map rows for new files | fixing a path, adding a new module's row |

To change the skill:
1. Edit it, bump `metadata.version` and `metadata.updated` (`date +%F`), and add a CHANGELOG entry.
2. Check the frontmatter (the description must stay ≤ 1024 chars):
   `python -m scripts.quick_validate .claude/skills/onion-architecture` from the skill-creator directory (it needs PyYAML).
3. For rule changes, rerun the eval loop (skill-creator), using `evals/evals.json` as the starting set.
4. Keep the catalog row in `.claude/skills/README.md` and the pointer in `server/AGENTS.md` in sync.

## Status and known gaps

- v1.0.0 eval: pass rate 100% with the skill vs 100% without it, so the current prompts don't discriminate.
  The next iteration needs prompts that extend code with a bad precedent (e.g. `pulls/routes.ts`). See the root `INSIGHTS.md`.
- The rules aren't enforced automatically. The review checklist uses grep, because `AGENTS.md` says not to add a linter unasked.
  `dependency-cruiser` is already a server dependency if that decision changes.
- Existing violations D1–D9 are recorded, not fixed (the decision is in the spec).

## Sources

The full per-rule mapping is in [`references/sources.md`](references/sources.md). The research with 42 sources is in
[`docs/research/onion-architecture-skill-plan.md`](../../../docs/research/onion-architecture-skill-plan.md).
Spec and delivery log: [`specs/onion-architecture-skill.md`](../../../specs/onion-architecture-skill.md).

**Onion / ports & adapters: the originals**
- [Jeffrey Palermo: The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) · [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) · [part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/) · [part 4](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/)
- [Alistair Cockburn: Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [Robert C. Martin: The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Herberto Graça: Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/) · [Explicit Architecture](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)
- [Microsoft Learn: Common web application architectures](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures)

**Pure core and boundaries**
- [Gary Bernhardt: Functional Core, Imperative Shell](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell)
- [Mark Seemann: Impureim sandwich](https://blog.ploeh.dk/2020/03/02/impureim-sandwich/) · [Dependency rejection](https://blog.ploeh.dk/2017/02/02/dependency-rejection/)
- [Alexis King: Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)

**Patterns**
- [Fowler, PoEAA: Repository](https://martinfowler.com/eaaCatalog/repository.html) · [Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html) · [Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html)
- [Khalil Stemmler: DTOs, Mappers & Repository](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/) · [Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/)
- [Sentry: Atomic repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
- [Sairyss: domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon)

**Stack docs**
- Fastify: [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) · [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) · [Errors](https://fastify.dev/docs/latest/Reference/Errors/) · [Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/) · [Testing](https://fastify.dev/docs/latest/Guides/Testing/)
- [Drizzle: Transactions](https://orm.drizzle.team/docs/transactions) · [Zod](https://zod.dev/) · [Testcontainers for Node.js](https://node.testcontainers.org/)

**Testing**
- [Vladimir Khorikov: Don't mock your database](https://vkhorikov.medium.com/dont-mock-your-database-it-s-an-implementation-detail-8f1b527c78be) · [Mocking types that you own](https://khorikov.org/posts/2020-06-15-mocking-types-that-you-own/)
