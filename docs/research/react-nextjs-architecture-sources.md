# React / Next.js frontend architecture — source plan

> Research from 2026-09-19. A source list only (a plan); no skill is being created yet. Topic:
> where components live, how to split them, where constants / utils / helpers / types go,
> where business logic lives, and the boundaries between features.
>
> Priority: **A** — primary / canonical, rules come from here; **B** — strong author experience,
> use for reasoning; **C** — reference / examples.

---

## 1. Official documentation (foundation)

| # | Source | What to take | Priority |
|---|---|---|---|
| 1 | [Thinking in React — react.dev](https://react.dev/learn/thinking-in-react) | Break the UI into a component hierarchy; single responsibility; components mirror the shape of the data model; build a static version first | A |
| 2 | [Keeping Components Pure — react.dev](https://react.dev/learn/keeping-components-pure) | A component is a pure function; no side effects during render | A |
| 3 | [Components and Hooks must be pure — Rules of React](https://react.dev/reference/rules/components-and-hooks-must-be-pure) | Formal purity rules (idempotent, never mutate non-local values) | A |
| 4 | [Choosing the State Structure — react.dev](https://react.dev/learn/choosing-the-state-structure) | Don't store derived values; avoid duplication; keep state flat; group related state | A |
| 5 | [Sharing State Between Components — react.dev](https://react.dev/learn/sharing-state-between-components) | Lifting state up; single source of truth | A |
| 6 | [Reusing Logic with Custom Hooks — react.dev](https://react.dev/learn/reusing-logic-with-custom-hooks) | Logic → custom hooks; `use` + Capital naming; hooks share logic, not state | A |
| 7 | [You Might Not Need an Effect — react.dev](https://react.dev/learn/you-might-not-need-an-effect) | Compute during render instead of effect + state; handle events in handlers | A |
| 8 | [Next.js — Project Structure (colocation, private `_folders`, route groups)](https://nextjs.org/docs/app/getting-started/project-structure) | Colocation in `app/`, `_components` as a private folder, `src/`, organization strategies | A (our client runs Next 15) |

## 2. Folder / feature structure

| # | Source | What to take | Priority |
|---|---|---|---|
| 9 | [bulletproof-react — docs/project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) · [repo](https://github.com/alan2207/bulletproof-react) | Reference structure `src/{app,components,config,features,hooks,lib,stores,testing,types,utils}` and inside a feature `{api,components,hooks,stores,types,utils}`; no cross-feature imports; unidirectional flow shared → features → app; **no barrel files**; enforced via ESLint `import/no-restricted-paths` | A |
| 10 | [Robin Wieruch — React Folder Structure Best Practices [2026]](https://www.robinwieruch.de/react-folder-structure/) | Evolution from a single file to features/domains; **promotion rule**: "one consumer — keep it local; two or more — move it to shared" (for utils, hooks, constants, components); where constants / utils / types / tests go; a feature's public API via `index.ts` | A |
| 11 | [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) · [Slices & segments](https://feature-sliced.design/docs/reference/slices-segments) · [documentation repo](https://github.com/feature-sliced/documentation) | Formal methodology: layers → slices → segments (`ui`, `model`, `api`, `lib`, `config`); import only from lower layers; slices on the same layer don't know about each other | A (as the "heavyweight" alternative) |
| 12 | [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) | Folder per component: `Component.tsx`, `Component.helpers.ts`, `Component.types.ts`, `constants`, `index.ts`; organizing "by function" — a counterpoint to feature-first | B |
| 13 | [profy.dev — Popular React Folder Structures and Screaming Architecture](https://profy.dev/article/react-folder-structure) | Comparison of approaches (flat, by type, by feature); "screaming architecture" — the structure should shout the domain | B |
| 14 | [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/) | Practical walkthrough of a feature structure + module boundaries | B |
| 15 | [Web Dev Simplified — How To Structure React Projects From Beginner To Advanced](https://blog.webdevsimplified.com/2022-07/react-folder-structure/) | Three levels of structural complexity — a good mental progression | C |
| 16 | [React Handbook — Project Standards](https://reacthandbook.dev/project-standards) | Summary of project standards (structure, naming, linting) | C |
| 17 | [dangz.dev — How to structure a React app in 2026](https://dangz.dev/blog/how-to-structure-a-react-app-in-2026) | A fresh 2026 take: "colocate first, extract later" | C |

## 3. Colocation and abstractions (when to extract, and when not to)

| # | Source | What to take | Priority |
|---|---|---|---|
| 18 | [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) | "Place code as close to where it's relevant as possible"; tests next to code; be careful about extracting to `utils` too early | A |
| 19 | [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) | Avoid Hasty Abstractions; "prefer duplication over the wrong abstraction" — the criterion for extracting into a helper/shared module | A |
| 20 | [Kent C. Dodds — When to break up a component into multiple components](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components) | Criteria for splitting a component (reuse, state, performance), not file length by itself | A |
| 21 | [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) | Why `index.ts` re-exports hurt (tree-shaking, dev server, circular imports) | A |

## 4. Business logic, layers, state

| # | Source | What to take | Priority |
|---|---|---|---|
| 22 | [Juntao Qiu / martinfowler.com — Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) | **The main source on business logic**: layers View (components) → State (custom hooks) → Domain models (pure functions/classes, no React) → Data/Network (gateways, anti-corruption layer); curing shotgun surgery | A |
| 23 | [martinfowler.com — Data Fetching Patterns in Single-Page Applications](https://martinfowler.com/articles/data-fetch-spa.html) | Data-loading patterns; where fetch logic lives | B |
| 24 | [Kent C. Dodds — Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react) | Server cache vs UI state — don't mix them; state in the closest common parent | A |
| 25 | [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster) | Keep state as low in the tree as possible | B |
| 26 | [TkDodo — Practical React Query](https://tkdodo.eu/blog/practical-react-query) | Server state isn't "ours" — it lives in the TanStack Query cache, not a global store; custom hooks around `useQuery` (ours: `client/src/lib/hooks/`) | A |
| 27 | [Dan Abramov — Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) | The historical pattern + **the author's update**: with hooks he no longer recommends the strict split — logic goes into hooks | B |
| 28 | [patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/) | The same pattern in a modern write-up + hooks as the replacement | C |

## 5. Component composition

| # | Source | What to take | Priority |
|---|---|---|---|
| 29 | [Dan Abramov — Before You memo()](https://overreacted.io/before-you-memo/) | "Move state down" and "lift content up" (via `children`) as tools for splitting components | A |
| 30 | [patterns.dev — Compound Pattern](https://www.patterns.dev/react/compound-pattern/) | Compound components via context instead of "prop hell" | B |
| 31 | [Alex Kondov — Tao of React](https://alexkondov.com/tao-of-react/) | A set of short rules: components, structure, state, data fetching; "a component is a function — split it like a function" | B |

## 6. Naming and style

| # | Source | What to take | Priority |
|---|---|---|---|
| 32 | [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react) | PascalCase for components, file name = component name, one component per file | B |
| 33 | [Firefox Ecosystem Platform — React Style Guide](https://mozilla.github.io/ecosystem-platform/reference/style-guides/react-style-guide) | Example of a real team style guide | C |

## 7. Enforcement (checking it automatically)

| # | Source | What to take | Priority |
|---|---|---|---|
| 34 | [eslint-plugin-import — no-restricted-paths](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md) | Import zones: no cross-feature imports, unidirectional flow | B |
| 35 | [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries/blob/master/README.md) | Declarative architectural layers and allowed dependencies | B |
| 36 | [Matias Kinnunen — Using ESLint to restrict where files can be imported from](https://mtsknn.fi/blog/eslint-import-restrictions/) | A practical config example | C |

> ⚠️ DevDigest has no linter, and one must not be added unasked (AGENTS.md) — these sources are only
> for phrasing rules that get checked by eye.

## 8. Existing agent skills (for format, not content)

| # | Source | What to take | Priority |
|---|---|---|---|
| 37 | [vercel-labs/agent-skills — react-best-practices/SKILL.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md) · [AGENTS.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/AGENTS.md) · [Vercel announcement](https://vercel.com/blog/introducing-react-best-practices) | Format: rules prioritized by impact, grouped into categories. Content is about performance, so little overlap with our topic | B |
| 38 | Local [`.claude/skills/react-best-practices/SKILL.md`](../../.claude/skills/react-best-practices/SKILL.md) | Already covers anti-patterns, derive-don't-store, hooks, part of composition. **New material should complement it, not duplicate it — focus on structure / code placement** | A |

## 9. Next.js App Router — architecture and code placement (not performance)

> DevDigest context: `client/` is Next.js 15 App Router, but **with no backend of its own in Next**:
> data comes from the Fastify API via `client/src/lib/api.ts` + TanStack Query hooks. So the DAL / Server Actions
> material in the Next docs is mostly reference for us; what matters is where things live and where the server/client boundary is.
> The client's current strategy = "split by feature or route" from the Next docs: route-local `_components/`
> inside `app/`, shared code in `src/components/` and `src/lib/`.

| # | Source | What to take | Priority |
|---|---|---|---|
| 39 | [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) | **The main official source.** Next is "unopinionated"; three strategies: (1) all code outside `app/`, `app/` for routing only, (2) shared folders at the root of `app/`, (3) **split by feature or route** — shared code at the top, specific code in route segments. Private folders `_components` / `_lib` (separate UI from routing, avoid clashes with future conventions); route groups `(group)` for shared layouts without changing the URL; `src/`. The docs' conclusion: "choose a strategy and be consistent" | A |
| 40 | [Next.js — Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) | Grouping routes by section/team, separate layouts and `loading` for a subset of routes | A |
| 41 | [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Server by default; `'use client'` only where interactivity is needed; push client components down the tree; server content inside a client component via `children` | A |
| 42 | [Next.js — Server and Client Boundary (guide)](https://nextjs.org/docs/app/guides/server-and-client-boundary) · [`use client` directive](https://nextjs.org/docs/app/api-reference/directives/use-client) | `'use client'` only at the **entry** to a client subtree, not in every file; everything imported from there becomes client code — this decides where shared helpers/constants can live | A |
| 43 | [Vercel Academy — Client-Server Component Boundaries](https://vercel.com/academy/nextjs-foundations/client-server-boundaries) | Tutorial on boundaries: extract a small interactive wrapper, keep the rest on the server | B |
| 44 | [Next.js — Data Security (Data Access Layer)](https://nextjs.org/docs/app/guides/data-security) · [How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions) | The official DAL pattern: a separate `server-only` module, auth checks inside, returns DTOs; Server Actions stay thin. For us — the principle "data access in one layer, not in components" (ours = `lib/api.ts` + `lib/hooks/`) | B |
| 45 | [Next.js — Client-side data fetching: TanStack Query](https://nextjs.org/docs/app/guides/client-side-data-fetching/tanstack-query) | Next's official guide for our stack: where to put the `QueryClient` provider, how to combine it with the App Router | A |
| 46 | [TanStack Query — Advanced Server Rendering](https://tanstack.com/query/v5/docs/framework/react/guides/advanced-ssr) | Server Component as a "loader": `prefetchQuery` + `HydrationBoundary`, hooks stay in client components | B |
| 47 | [TkDodo — You Might Not Need React Query](https://tkdodo.eu/blog/you-might-not-need-react-query) | When to fetch in RSC vs keep data in React Query — the hybrid approach | B |
| 48 | [Feature-Sliced Design — Usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs) · [FSD blog — Next.js App Router Architecture](https://feature-sliced.design/blog/nextjs-app-router-guide) | Mapping FSD onto the App Router: root `app/` stays thin, only re-exporting pages from `src/_pages`; FSD layers prefixed `_app`/`_pages`; `index.server.ts` for a slice's server-only API | B (if we ever grow into FSD) |
| 49 | [Robin Wieruch — Next.js Forms with Server Actions [2026]](https://www.robinwieruch.de/next-forms/) · [The Road to Next](https://www.road-to-next.com/) | Feature structure in full-stack Next: `features/<name>/{components,queries,actions,types}`, naming `get-*` / `*-action.ts` | C (we have no Server Actions) |
| 50 | [MakerKit — Next.js 16 App Router Project Structure: The Definitive Guide](https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure) | A detailed large-project example: thin `app/`, logic in `features/` / `lib/` | C |
| 51 | [dev.to — How I Structure Large-Scale Next.js Applications in 2026](https://dev.to/vrushikvisavadiya/how-i-structure-large-scale-nextjs-applications-in-2026-41pc) | "The route defines where the page is; the feature defines what it does"; keep business logic out of `app/` | C |
| 52 | Local [`.claude/skills/next-best-practices/`](../../.claude/skills/next-best-practices/SKILL.md) | Already covers the API level: file conventions, RSC boundaries, data patterns, route handlers, error handling. **New material should reference it for Next API specifics, not duplicate it** | A |

---

## Conflicts between sources (to resolve before writing rules)

1. **Feature-first vs by-type.** bulletproof / Wieruch / FSD — by feature; Josh Comeau — by function
   (`components/`, `hooks/`, `helpers/`). The 2026 consensus — feature-first + a shared layer.
2. **File naming.** Wieruch — kebab-case (`project-form.tsx`); Airbnb / Comeau — PascalCase.
   DevDigest already has a convention: route-local components — `PascalName/PascalName.tsx`, shared — `kebab-name/`.
3. **Barrel files.** bulletproof and TkDodo — against; Wieruch and FSD — `index.ts` as a feature's public API.
   In DevDigest every component has an `index.ts` re-export — distinguish a "single-component re-export" (fine)
   from a "barrel for a whole feature/folder" (bad).
4. **Container/Presentational.** The author himself dropped the strict split — logic moves into hooks,
   not into separate wrapper components.
5. **When to extract into utils.** Wieruch — promote at 2+ consumers; Kent (AHA) — even more cautious,
   duplication beats the wrong abstraction.
6. **Code inside `app/` or outside it (Next.js).** The Next docs allow both; most 2026 articles
   recommend a thin `app/` + `features/`. DevDigest currently colocates route-local code in `app/**/_components/`
   (the "split by feature or route" strategy) — the rules should lock that in, not migrate to `features/`.
7. **`'use client'` and shared modules.** A helper/constant imported from a client entry ends up in the client
   bundle — we need a rule that server-only code (secrets, env) doesn't sit next to client helpers.

## Already established in DevDigest (new rules must stay consistent with it)

- `AGENTS.md` → "Naming conventions": `_components/<PascalName>/{PascalName.tsx, index.ts, styles.ts, constants.ts, helpers.ts, PascalName.test.tsx}`,
  nested `_components` for sub-components, shared — `client/src/components/<kebab-name>/`,
  modules — `client/src/lib/<kebab-name>.ts`, hooks — `client/src/lib/hooks/<domain>.ts`.
- `client/AGENTS.md` — the client package's own rules.
