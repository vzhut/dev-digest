# Placement map — every `client/src` folder, and what may import it

Load this when you need to know where an existing thing lives, whether a folder already has a home for
your file, or whether an import you're about to write is allowed. `SKILL.md` has the rules; this file has
the current state of the code they describe. Inventory taken 2026-09-20 (branch `lesson-02`).

## Contents

1. [Layer lookup — who may import whom](#1-layer-lookup--who-may-import-whom)
2. [Routes](#2-routes)
3. [Route-local components](#3-route-local-components)
4. [Shared components (`src/components/`)](#4-shared-components-srccomponents)
5. [`src/lib/` — the non-UI shared layer](#5-srclib--the-non-ui-shared-layer)
6. [Where the exceptions are](#6-where-the-exceptions-are)

---

## 1. Layer lookup — who may import whom

Read a row as "a file in this layer may import the ✅ columns". `vendor` is `@devdigest/ui` +
`@devdigest/shared`, always allowed, never edited.

| Layer ↓ may import → | own tree | other route's `_components` | `@/components/*` | `@/lib/*` | vendor |
|---|:--:|:--:|:--:|:--:|:--:|
| `app/<route>/**` | ✅ | ❌ promote instead (§7) | ✅ | ✅ | ✅ |
| `components/<kebab>/**` | ✅ | ❌ | ✅ | ✅ | ✅ |
| `lib/**` | ✅ | ❌ | ❌ | ✅ | ✅ |
| `lib/hooks/<domain>.ts` | ✅ | ❌ | ❌ | `lib/api.ts` only for HTTP | ✅ |

Two arrows never appear anywhere in the codebase, and adding one is the signal that a file is in the
wrong place: `lib → components`, and `lib | components → app`. Check with:

```bash
grep -rn "@/app/" client/src/lib client/src/components   # must print nothing
grep -rn "\.\./\.\./\.\./" client/src/app                 # deep relatives: use @/ instead
```

## 2. Routes

Every `page.tsx` is a thin server component: it exports `metadata` and renders one View. None of them
carries `'use client'`, and none contains a hook.

| Route | `page.tsx` renders | Route-level shared files |
|---|---|---|
| `/` | `_components/HomeView` | — |
| `/onboarding` | `onboarding/_components/AddRepoView` | — |
| `/agents` | `agents/_components/AgentsListView` | — |
| `/agents/[id]` | `agents/[id]/_components/AgentEditorView` | — |
| `/repos/[repoId]/pulls` | `pulls/_components/PullsView` | `pulls/constants.ts`, `pulls/helpers.ts`, `pulls/styles.ts` |
| `/repos/[repoId]/pulls/[number]` | `pulls/[number]/_components/PrDetailView` | — |
| `/settings/[section]` | `settings/[section]/_components/SettingsView` | — |

Special files: `app/layout.tsx` (providers), `app/error.tsx` → `NotFoundView`'s sibling `ErrorState`,
`app/not-found.tsx` → `_components/NotFoundView`. Both render through a client View, because the UI kit
crashes when imported into a server component (see `client/INSIGHTS.md`).

`app/_components/` holds the two Views that belong to the root route and to `not-found`, not "global"
components — those live in `src/components/`.

## 3. Route-local components

The deepest tree in the app, `/repos/[repoId]/pulls/[number]`, is the reference for how nesting works:

```
pulls/[number]/_components/
├── PrDetailView/          the client entry: URL state, data hooks, tab composition
├── PrDetailHeader/        title, meta, tabs, RunReviewDropdown
├── OverviewTab/ FindingsTab/ DiffTab/     one per tab, conditionally rendered (§6.3)
├── FindingsPanel/         + _components/SeverityPills/     (child owned by one parent)
├── FindingCard/           constants.ts + helpers.ts + styles.ts — full anatomy
├── ReviewRunAccordion/    one review run, collapsible
├── RunHistory/            timeline: helpers.ts + _components/RunRow, CommitRow
├── RunStatus/ RunReviewDropdown/          live run UI over useRunEvents
├── VerdictBanner/
└── RunTraceDrawer/        constants.ts + helpers.ts + _components/{TraceBody,TraceSection,
                           PromptBlock,PromptModalBody,ToolCallRow,FindingsSection,atoms.tsx}
```

Things worth copying from it:

- **`atoms.tsx`** in `RunTraceDrawer/_components/` — markup-only pieces (label/value rows) shared by that
  one tree. No state, no test of their own, so they don't earn a folder each.
- **`RunHistory/helpers.ts`** — `timelineItems()` merges runs and commits into one sorted list. Pure, tested
  by `helpers.test.ts`, so the component is only layout.
- **`FindingsPanel/_components/SeverityPills/`** — a child with its own styles, owned by exactly one parent.

Other routes follow the same shape: `agents/_components/{AgentsListView,AgentCard}`,
`agents/[id]/_components/{AgentEditorView,AgentEditor}` (with `AgentEditor/_components/ConfigTab/`),
`settings/[section]/_components/SettingsView/_components/{SectionTitle,SettingsApiKeys,SettingsModels}`,
`pulls/_components/{PullsView,FilterBar,PRRow}`.

## 4. Shared components (`src/components/`)

| Folder | Used by | Why it's shared |
|---|---|---|
| `app-shell/` | `layout.tsx` (every route) | Shell + `hooks/` (`useGlobalShortcuts`, `useShellCommands`, `useShellContext`) — the model for a `hooks/` folder |
| `findings-popover/` | PR list rows + PR timeline | Same preview in two routes |
| `run-cost-badge/` | PR detail + timeline + accordion | One cost format everywhere |
| `repo-not-found/` | pulls list + PR detail | Same error state in two routes |
| `diff-viewer/` | DiffTab only | Large sub-tree (`CodeLine`, `FileCard`, `CommentCard`, `InlineComposer`, …) — kept shared by size, not by consumer count |
| `page-shell/` | `HomeView` only | One consumer; see §6 |
| `mermaid-diagram/` | nothing | No consumer at all; see §6 |
| `showcase/` | `src/test/smoke.test.tsx` | Dev-only gallery of the UI kit, deliberately not internationalized |

Sub-components here are plain `PascalName/` folders (`diff-viewer/CodeLine/`), **not** `_components/` —
that prefix is a Next.js routing convention and means nothing outside `app/`.

## 5. `src/lib/` — the non-UI shared layer

| File | Layer | Holds |
|---|---|---|
| `api.ts` | gateway | The only `fetch` in the app, `ApiError`, `apiErrorMessage(error, fallback)` |
| `hooks/core.ts` | state | Repos, PRs, settings |
| `hooks/reviews.ts` | state | Review runs, findings, query-key builders, `useRunEvents` (SSE) |
| `hooks/agents.ts` · `hooks/trace.ts` · `hooks/repo-intel.ts` | state | One file per domain |
| `severity.ts` | domain | `SEVERITY_RANK`, `severityCounts` — shared so pills and popover always agree |
| `format-cost.ts` · `model-label.ts` · `github-urls.ts` · `feature-models.ts` | domain | Pure formatting/lookup, one concept per module |
| `search-params.ts` | domain | Read/replace one search param; used by three routes |
| `types.ts` | types | Re-exports from `@devdigest/shared` + client-only view types |
| `providers.tsx` · `theme.tsx` · `toast.tsx` · `repo-context.tsx` | providers | App-wide context, mounted from `providers.tsx` |

There is no `lib/hooks/index.ts` barrel and no `utils.ts`. Import the domain file directly:
`import { usePrRuns } from "@/lib/hooks/reviews"`.

## 6. Where the exceptions are

Known and accepted, so nobody "fixes" them twice:

- **`page-shell/`, `diff-viewer/`, `lib/feature-models.ts` have one consumer each.** By §7 they'd be local.
  Moving them back is churn for no gain — leave them, but don't take them as licence to add more.
- **`components/mermaid-diagram/` has no consumer at all.** Kept pending a product decision (it may be
  material for a later lesson). Don't import it just to justify it.
- **`components/showcase/` is test-only.** Its `title=` props are English on purpose.
- **`src/vendor/ui/` is exempt from every rule here** — it is a vendored kit, the one place where inline
  `style={{…}}` objects are normal, and it must not be edited.

Anything else that looks like an exception is a bug in the placement, not a precedent.
