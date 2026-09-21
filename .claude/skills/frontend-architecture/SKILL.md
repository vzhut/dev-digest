---
name: frontend-architecture
description: "Where code lives and how it is split in the DevDigest client (client/src — Next.js 15 App Router + React 19 + TanStack Query). Use this whenever you add a new page, component, hook, constant, helper, type, API call or business rule to the client and have to pick a file/folder for it; when a component or page.tsx has grown big and needs splitting; when code from one route is needed by another (moving it to src/components or src/lib); when asked about folder structure, utils/helpers/constants placement, where business logic should go, _components, index.ts/barrels or import paths; and when reviewing a client change for structure. Use it even if the user never says 'architecture' — any 'where should this go' or 'this file is too big' in client/ qualifies. Not for how to write React code itself (react-best-practices) or Next.js API mechanics (next-best-practices)."
metadata:
  version: 1.1.0
  updated: 2026-09-20
  stack: next@15, react@19, "@tanstack/react-query@5", next-intl@3
---

# Frontend Architecture — where client code lives

Answers one question: **"I have this piece of code — where does it go, and how do I split it?"**
Paths are real `client/src` paths. The goal is that anyone (human or agent) can guess where a file is without searching,
and that moving or deleting a feature touches one folder instead of five.

Bundled files, loaded only when they're needed:
- [examples.md](examples.md) — before/after on real files. Read it when you're about to split a page/component,
  promote code to shared, or fix imports.
- [references/placement-map.md](references/placement-map.md) — every `client/src` folder, what lives there and who
  may import it. Read it to find where an existing thing lives, or to check an import before writing it.
- [references/sources.md](references/sources.md) — the article or doc behind each rule. Read it only when a rule
  is challenged.

**Quick procedure** for any new or moved piece of code:
1. What kind of thing is it? → row in §2.
2. How many places use it *now* (not "might later")? One → keep it next to that place. Two+ → lowest common level (§7).
3. Does it touch React? No → it's pure and goes to `helpers.ts` / `lib/<concept>.ts` (§4).
4. Check the import you'll need is allowed (§8). If not, the file is in the wrong place — move it, don't reach across.

Neighbours (link, don't repeat):
- How to write components, hooks, state, effects → `react-best-practices`
- Next.js mechanics (special files, RSC, route handlers) → `next-best-practices`
- Tests → `react-testing-library`

Strategy: Next.js *"split by feature or route"* — route-local code is colocated in `app/**/_components/`,
code used by 2+ routes lives in `src/components/` or `src/lib/`. There is no `features/` or `utils/` folder; don't add one.

---

## 1. The map

```
client/src/
├── app/                         routes only + their colocated code
│   ├── layout.tsx               root layout (providers)
│   └── <route>/
│       ├── page.tsx             thin: renders <Name>View
│       ├── constants.ts         route-level, shared by this route's _components  (optional)
│       ├── helpers.ts           route-level pure functions                       (optional)
│       └── _components/<Name>/  route-local components (private folder, not routed)
├── components/<kebab-name>/     UI used by 2+ routes
├── lib/
│   ├── api.ts                   the ONLY place that calls fetch
│   ├── hooks/<domain>.ts        TanStack Query hooks over api.ts, per domain
│   ├── <kebab-name>.ts          shared pure logic / formatting (severity.ts, format-cost.ts)
│   ├── <kebab-name>.tsx         app-wide providers/context (providers.tsx, theme.tsx, toast.tsx)
│   └── types.ts                 re-exports from @devdigest/shared + client-only types
├── i18n/                        next-intl setup
└── vendor/                      @devdigest/ui, @devdigest/shared — DO NOT EDIT
client/messages/en/<ns>.json     i18n strings, one namespace per area
```

## 2. Placement table — "I have X → it goes to Y"

| I have… | Goes to | Notes |
|---|---|---|
| A new route | `app/<route>/page.tsx` + `app/<route>/_components/<Name>View/` | Page renders the View, nothing else (§5) |
| A component used by one route | `app/<route>/_components/<Name>/<Name>.tsx` | Nearest route that uses it |
| A piece of one component | `…/<Parent>/_components/<Child>/<Child>.tsx` | Nest under the parent that owns it |
| Trivial markup-only pieces (label/value rows, tiles) used across one component tree | `…/<Parent>/_components/atoms.tsx` | No state, no logic, not tested alone — see `RunTraceDrawer/_components/atoms.tsx` |
| A component used by 2+ routes | `components/<kebab-name>/<PascalName>.tsx` | Promote (§7) |
| A constant used by one component | `<Name>/constants.ts` | `UPPER_SNAKE_CASE` |
| A constant used by several components of one route | `app/<route>/constants.ts` | e.g. `app/repos/[repoId]/pulls/constants.ts` |
| A constant used by 2+ routes | `lib/<kebab-name>.ts` (next to the logic it belongs to) | e.g. `SEVERITY_RANK` in `lib/severity.ts` |
| A pure function (format, filter, sort, map) for one component | `<Name>/helpers.ts` | No React, no hooks, no JSX |
| …for one route | `app/<route>/helpers.ts` | |
| …for 2+ routes | `lib/<kebab-name>.ts` | One module per concept, not a `utils.ts` dump |
| A business rule / domain calculation | `helpers.ts` or `lib/<concept>.ts` — **never inside the component body** | Pure, unit-tested (`helpers.test.ts`, `lib/<name>.test.ts`) |
| Styles | `<Name>/styles.ts` exporting `s` | Inline `style={{…}}` only for one-off trivial values |
| A type used by one file | Declare in that file | |
| A type shared inside one component folder | `<Name>/types.ts` | |
| A wire/API contract type | `@devdigest/shared` — never redefine | Client-only view types → `lib/types.ts` |
| Stateful UI logic of one component (keyboard nav, measuring, local reducers) | `<Name>/use<Thing>.ts`; several → `<Name>/hooks/` with `index.ts` | e.g. `components/app-shell/hooks/` |
| Server data (read or mutate) | `lib/hooks/<domain>.ts` hook over `lib/api.ts` | Components don't call `fetch` / `api.*` directly — query keys, polling and invalidation stay in one place |
| A new API endpoint call | a method on `api` in `lib/api.ts` | |
| App-wide context/provider | `lib/<kebab-name>.tsx`, mounted in `lib/providers.tsx` | Context only when prop drilling is real, not pre-emptively |
| UI text | `client/messages/en/<namespace>.json`, key `<component>.<key>` | Never hard-code user-visible strings |
| A test | Next to the file: `<Name>.test.tsx`, `helpers.test.ts` | |

If nothing fits: put it next to its only consumer and promote later.

## 3. Component folder anatomy

```
<Name>/
├── <Name>.tsx          the component; named export `export function <Name>`
├── index.ts            export { <Name> } from "./<Name>";   (+ public types if any)
├── styles.ts           export const s = { … }   — CSSProperties only
├── constants.ts        static data; no functions with logic
├── helpers.ts          pure functions; may import constants.ts, never React
├── types.ts            only if 2+ files in the folder share types
├── use<Thing>.ts       component-specific hook (or hooks/ when several)
├── <Name>.test.tsx     component test;  helpers.test.ts for pure logic
└── _components/<Child>/  sub-components, same anatomy
```

- Create a file only when it has content — a component with no constants has no `constants.ts`.
- Inside `app/` sub-components go in `_components/` (Next private folder). Inside `src/components/<kebab>/`
  there is no routing, so sub-components are plain `PascalName/` folders (see `components/diff-viewer/`).
- Export components by name. Default exports only where Next requires them (`page`, `layout`, `error`, `loading`, …).

## 4. Layers — where business logic lives

| Layer | Lives in | Does | Must not |
|---|---|---|---|
| View | `<Name>.tsx` | Render props/state, wire events to handlers | Compute domain values inline, call `api`, hold long logic blocks |
| State | `use<Thing>.ts`, `lib/hooks/<domain>.ts` | React state, effects, TanStack Query, URL params | Contain JSX; contain domain rules that could be pure |
| Domain / pure logic | `helpers.ts`, `lib/<concept>.ts` | Calculations, grouping, filtering, formatting, validation | Import React or touch the network |
| API | `lib/api.ts` | HTTP, error mapping (`ApiError`) | Know about components or query caches |

Test: **could this line run in a plain Node unit test with no React?** If yes, it belongs in the pure layer.
Rule of thumb from the code: `filterAgents` (AgentsListView/helpers.ts), `sizeOf` (pulls/helpers.ts) and
`severityCounts` (lib/severity.ts) are all extracted pure logic; the component only calls them.

Server state stays in the TanStack Query cache — don't copy it into `useState` or context.
UI state (open/closed, selected tab) lives in the lowest component that needs it; state that must survive
reload or be linkable goes into the URL (`?tab=`, `?trace=`), as in the PR detail page.

## 5. Pages and the server/client boundary

- `page.tsx` is a **thin server component** (no `'use client'`): it renders one `<Name>View` from
  `_components` and nothing else. Reference: `app/agents/page.tsx`, `app/settings/[section]/page.tsx`.
  Why: the route file then only says *where* the screen is; the View says *what* it does, can be tested like any
  component, and moving the screen to another URL is a one-line change.
- The View is the client entry. It reads `useParams` / `useSearchParams` itself and composes route components.
- Every file that uses hooks, state, event handlers or browser APIs starts with `'use client'` (current convention — explicit per file).
- `constants.ts`, `helpers.ts`, `styles.ts`, `types.ts`, `lib/<pure>.ts` have **no** `'use client'` — they are safe on both sides.
- The client has no backend of its own: no Server Actions, no `app/api/*` route handlers, no DB access.
  All data comes from the Fastify API through `lib/api.ts`.
- Loading/error/empty states for a page live in its View (the UI kit's `Skeleton`, `ErrorState`, `EmptyState`).

## 6. When to split a component

Split when **any** of these is true — length alone (≈200 lines) is only a prompt to look:

1. A block has **its own state** that the rest of the component doesn't read → move it down into a child ("move state down").
2. You can name a block with **one noun** that isn't the parent's name (header, filter bar, row, tab).
3. A block is **conditionally rendered** as a whole (tab body, modal, drawer, empty state with its own logic).
4. A block is **repeated** in a `.map()` and has more than a couple of elements → `<Item>` child.
5. You want to **test** it in isolation.
6. Another place needs the **same** block → split, then promote (§7).

How, in this order:
1. Pull non-React logic into `helpers.ts` first — often that alone is enough.
2. Pull stateful logic into `use<Thing>.ts`.
3. Only then split JSX into `_components/<Child>/`.
4. If a wrapper doesn't use its children's data, pass them as `children` ("lift content up") instead of threading props.

Don't: split into `renderHeader()` functions inside the component (see `react-best-practices` → Render Factories);
create a child that takes 8+ props just to forward them — the boundary is wrong.

## 7. Promotion ladder — when code moves up

```
<Name>/helpers.ts ──(2nd component in same route)──▶ app/<route>/helpers.ts ──(2nd route)──▶ lib/<concept>.ts
<Name>/_components/X ──(sibling needs it)──▶ app/<route>/_components/X ──(2nd route)──▶ components/<kebab-x>/
```

- **One consumer → stays local.** Don't pre-emptively put things in `lib/` or `components/`.
- **Second consumer → promote to the lowest common level**, not straight to global. `lib/` and `components/` are
  what every route sees; each thing put there without need makes the shared layer noisier and harder to change safely.
- **Promote only when the semantics are identical.** Two lookalike 3-line helpers with different meaning
  stay duplicated — duplication beats the wrong abstraction (AHA).
- When promoting: move the file, update imports, move its test with it, delete the old copy. No re-export shim left behind.
- Model example: `lib/severity.ts` — grouping used by both the Review-runs pills and the findings popover, so the numbers always agree.

## 8. Import boundaries

| From | May import | Must not import |
|---|---|---|
| `app/<route>/**` | its own tree, `@/components/*`, `@/lib/*`, `@devdigest/ui`, `@devdigest/shared` | another route's `_components` or helpers |
| `components/<kebab>/**` | its own tree, other `@/components/*`, `@/lib/*`, vendor | anything under `app/` |
| `lib/**` | other `lib/*`, vendor | `app/`, `components/` |

- A route that needs another route's component → **promote it** (§7), don't reach across.
- **Relative paths only inside the component's own folder tree** (`./helpers`, `./_components/Child`, `../styles` from a child).
  Everything else via the alias: `@/lib/hooks/reviews`, `@/components/app-shell` — not `../../../../lib/…`.
  Why: alias imports survive moving the file (promotion, splitting), and they make boundary violations visible —
  an `@/app/…` import in `components/` stands out, a `../../../` one doesn't.
- Import another component through its folder (`@/components/diff-viewer`, `../AgentCard`), not its internal files.
- Data hooks: import the domain file (`@/lib/hooks/reviews`), not the `@/lib/hooks` barrel.

## 9. `index.ts`

- `index.ts` is the folder's **public API**: named re-exports only — `export { DiffViewer } from "./DiffViewer"; export type { DiffCommentApi } from "./comments";`
- **No `export *`**, anywhere. It makes every importer load every module in the folder (slower dev server and
  tests, circular-import surprises) and silently turns internals into public API. The last one
  (`lib/hooks/index.ts`) was deleted in the improvement plan — import the domain file, `@/lib/hooks/reviews`.
- Don't re-export internals (helpers, constants, sub-components) unless an outside consumer genuinely needs them.

## 10. Naming

| Thing | Convention | Example |
|---|---|---|
| Route-local component folder + file | `PascalCase` | `_components/FindingCard/FindingCard.tsx` |
| Shared component folder | `kebab-case`, file inside `PascalCase` | `components/run-cost-badge/RunCostBadge.tsx` |
| Shared non-UI module | `kebab-case.ts` | `lib/format-cost.ts` |
| Hook | `use<Thing>` | `useShellCommands.ts`, `usePrRuns` |
| Styles object | `s` | `export const s = { card: … }` |
| Module constant | `UPPER_SNAKE_CASE` | `SEVERITY_RANK`, `MODEL_COLOR` |
| i18n | namespace file `camelCase.json`, keys `component.key` | `prReview.panel.severityFilter` |

Full list: `AGENTS.md` → *Naming conventions*. If this skill and `AGENTS.md` disagree, `AGENTS.md` wins — fix the skill.

## 11. Review checklist

1. Is every new file in the place §2 says? Would a newcomer find it by guessing?
2. Is `page.tsx` thin (renders one View, no hooks, no `'use client'`)?
3. Any `fetch` / `api.*` outside `lib/api.ts` and `lib/hooks/`? Any server data copied into `useState`?
4. Any domain logic (grouping, filtering, formatting, thresholds) inside a component body instead of `helpers.ts` / `lib/`?
5. Any component with state/blocks that §6 says should be a child?
6. Anything placed in `lib/` or `components/` with only one consumer? Anything used by 2 routes but still living in one route's `_components`?
7. Any import that crosses routes, goes `lib → components/app`, or uses a deep `../../../` path?
8. Any new `export *`, default-exported component, or `index.ts` exposing internals?
9. Any hard-coded user-visible string, or wire type redefined instead of taken from `@devdigest/shared`?
10. Tests moved along with promoted code?

## Accepted exceptions — real, and not precedents

These are known and deliberate. Don't "fix" them in an unrelated change, and don't cite them as permission.

- **One-consumer shared modules:** `components/page-shell/`, `components/diff-viewer/`, `lib/feature-models.ts`.
  By §7 they'd be route-local; moving them back is churn. Nothing new joins them without a second consumer.
- **`components/mermaid-diagram/` has no consumer at all** — kept pending a product decision.
- **`components/showcase/`** is rendered only by `src/test/smoke.test.tsx`; its labels are English on purpose.
- **`src/vendor/ui/`** is exempt from everything here, including the inline-styles rule. It is vendored — don't edit it.
  The one sanctioned exception is **`src/vendor/ui/nav.ts`**: the sidebar entries (Skills, Agents, and the homework's Conventions) are app wiring, so adding or moving an item there is a deliberate one-line edit — say so in the commit body.

Everything the v1.0.0 version of this skill listed as debt (fat pages, `'use client'` on a thin page, deep
relative imports, the `lib/hooks` barrel, default-exported components) has since been fixed; see
[`client/docs/improvement-plan.md`](../../../client/docs/improvement-plan.md). If you find a *new* instance,
it is a review finding, not debt.

## Versioning

`metadata.version` is SemVer; history in [CHANGELOG.md](CHANGELOG.md), the human-facing overview in [README.md](README.md).
MAJOR — code that complied now doesn't (a placement rule changed) · MINOR — a new rule or section · PATCH — wording, examples, links.
Bump the version and `updated` in the same commit as the change. Re-check the rules when the major version of anything in `stack` changes.
