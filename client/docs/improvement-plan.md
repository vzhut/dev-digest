# Client improvement plan

Analysis of `client/src` on 2026-09-19 (branch `lesson-02`) against three project skills:
`frontend-architecture` (FA), `react-best-practices` (RBP), `next-best-practices` (NBP).
Frontend only. Nothing here is implemented yet — each item is a proposal with evidence.

Effort: **S** < 1h · **M** a few hours · **L** a day+. Priority: **P1** risk of bugs or silent breakage ·
**P2** architecture / maintainability · **P3** cleanup and judgement calls.

## What's already good

- No `fetch` / `api.*` outside `lib/api.ts` + `lib/hooks/`; no server data copied into state.
- `lib/` never imports `app/` or `components/`; no route imports another route's `_components`.
- No render factories, no `forwardRef`, no `<img>`, no `any`, no `count && …` zero-rendering bugs.
- Component folders follow the anatomy (`index.ts`, `styles.ts`, `constants.ts`, `helpers.ts`) almost everywhere.
- Pure logic already extracted in the right places: `lib/severity.ts`, `pulls/helpers.ts`, `AgentsListView/helpers.ts`.
- `useEffect` is rare (13 sites) and most sync with a real external system (keyboard, `localStorage`, SSE, DOM scroll).

---

## P1 — risk of bugs or silent breakage

| # | Finding | Evidence | Rule | Fix | Effort |
|---|---|---|---|---|---|
| 1 | Index keys on lists whose children hold state. `FileCard` has its own `open` state, so when the file list changes (new push, refetch), the expanded/collapsed state jumps to the wrong file. | `components/diff-viewer/DiffViewer/DiffViewer.tsx:28` (`FileCard key={i}`, state at `FileCard.tsx:35`); `RunTraceDrawer/_components/TraceBody/TraceBody.tsx:102` (`ToolCallRow key={i}`, state at `ToolCallRow.tsx:12`); `PromptModalBody.tsx:66` (filtered list, `key={i}`) | RBP → Key Prop Patterns (CRITICAL) | `key={f.path}`; tool calls → stable id or `name+index` if none; filtered lines → original line number | S |
| 2 | Form reset through `useEffect` + 9 `useState` + disabled deps lint. Stale fields for one render when switching agents; any new field must be remembered in two places. | `app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx:18-39` | RBP → Hooks (no effect for derived/reset state), State Hygiene (`useReducer` for related state) | Render `<ConfigTab key={agent.id} …>` in the parent so React resets it; keep one `form` object / `useReducer` | S |
| 3 | Query keys hard-coded in a page and invalidated there. A key rename in `lib/hooks/reviews.ts` silently stops the refresh — no type error, just stale UI. | `app/repos/[repoId]/pulls/[number]/page.tsx:50-58` (`["pr-active-runs", prId]`, `["pr-runs", prId]`) | FA §2 (server data → `lib/hooks/<domain>.ts`), §4 | Export query-key builders from `lib/hooks/reviews.ts` and do the invalidation inside the hooks (`onSuccess` / an `useInvalidatePrRuns()` helper) | S |
| 4 | User-visible strings bypass i18n. | `PrDetailHeader.tsx:116-118` (tab labels); `pulls/[number]/page.tsx:85` + error title; `agents/[id]/page.tsx:35-36, 45-46, 78`; `app/page.tsx:22-33`; `AddRepoView.tsx:77`; `FindingsTab.tsx:151`; `ReviewRunAccordion.tsx:125`; `AgentCard.tsx:47`; `RunReviewDropdown.tsx:61` | FA §2 (UI text), §11.9 | Move to `messages/en/<namespace>.json` (`prReview`, `agents`, `onboarding`, `common`) | M |
| 5 | No route-level error boundary. A render-time crash in any View shows Next's default error screen instead of the app's `ErrorState`. | no `error.tsx` / `global-error.tsx` / `not-found.tsx` under `app/` | NBP → Error Handling | Add `app/error.tsx` (client, `ErrorState` + `reset`) and `app/not-found.tsx`; data errors stay in Views (FA §5) | S |

## P2 — architecture and maintainability

| # | Finding | Evidence | Rule | Fix | Effort |
|---|---|---|---|---|---|
| 6 | Fat client pages: hooks, URL state, loading/error branches and layout all in `page.tsx`. | `pulls/[number]/page.tsx` (185 lines), `pulls/page.tsx` (135), `agents/[id]/page.tsx` (124), `app/page.tsx` (49); `onboarding/page.tsx` is thin but marked `'use client'` | FA §5, examples.md #1 | Move each body into `_components/<Name>View/`; `page.tsx` becomes a server component. **Bonus:** a server page can export `metadata` — today every tab is titled "DevDigest" (`app/layout.tsx:9`) | M each |
| 7 | The same "set one search param and `router.replace`" code in three routes. | `pulls/[number]/page.tsx:63`, `pulls/page.tsx:41`, `agents/[id]/page.tsx:29` | FA §7 (2+ routes → promote) | One shared hook, e.g. `useSearchParamState(key)`; do together with #6 | S |
| 8 | `ApiError` → message mapping repeated in five places. | `pulls/page.tsx:116`, `pulls/[number]/page.tsx:116`, `agents/[id]/page.tsx:46`, `AddRepoView.tsx`, `SettingsApiKeys.tsx` | FA §7 | `apiErrorMessage(error, fallback)` in `lib/api.ts` | S |
| 9 | Deep relative imports (`../../../../../lib/hooks`). | 31 files under `app/` and `components/` | FA §8 | Mechanical rewrite to `@/…` in one commit | S |
| 10 | Inline style objects instead of `styles.ts`. | `AddRepoView.tsx` (16), `RunHistory.tsx` (15), `agents/[id]/page.tsx` (13), `ReviewRunAccordion.tsx` (11), `PromptModalBody.tsx` (7), `FindingsSection.tsx` (7), `lib/toast.tsx` (5) | FA §2 (styles) | Move to `s` in `styles.ts`; fold into #6 for the pages | M |
| 11 | Effects used as event notifications. `RunStatus` watches `running` to call `onDone`; `useRunEvents` and `ReviewRunAccordion` disable `exhaustive-deps`. | `RunStatus.tsx:23-26`, `lib/hooks/reviews.ts:212`, `ReviewRunAccordion.tsx:48-54` | RBP → useEffect Rules | Give `useRunEvents` an `onSettled` callback and call it where the stream ends; review the two disabled-deps effects | M |
| 12 | `RunHistory.tsx` is the largest route component (it has a test, but its pure functions are only covered through rendering). | `RunHistory.tsx` 247 lines, `outcomeOf` (:24), `tsOf` (:83) | FA §6 (helpers first), §3 | `helpers.ts` + `helpers.test.ts`; timeline item → `_components/RunHistoryItem` | M |
| 13 | Default-exported components. | `RunTraceDrawer`, `ReviewRunAccordion`, `MermaidDiagram`, `RepoNotFound` | FA §3 | Named exports, update imports | S |
| 14 | `export *` barrels. | `lib/hooks/index.ts`, `components/showcase/index.ts` | FA §9 | Named re-exports; new code imports `@/lib/hooks/<domain>` | S |

## P3 — cleanup and judgement calls

| # | Finding | Evidence | Suggestion | Effort |
|---|---|---|---|---|
| 15 | `components/mermaid-diagram` has no consumers. | `grep` finds no import outside its own folder | Possibly material for a later lesson (L02–L08 are intentionally absent) — confirm before deleting | S |
| 16 | `components/showcase` is used only by `test/smoke.test.tsx`; its header mentions a `/showcase` route that doesn't exist. | `components/showcase/Showcase.tsx:1-3` | Fix the comment, or move it under `src/test/` | S |
| 17 | Shared-layer modules with one consumer: `diff-viewer` (DiffTab), `page-shell` (app/page), `lib/feature-models.ts` (SettingsModels). | consumer counts | By FA §7 they'd be local. Moving them back is churn — leave as is, just don't add more | — |
| 18 | 34 of 47 component files have no test. Logic-heavy and untested: `ConfigTab`, `AddRepoView`, `PrDetailHeader`, `ReviewRunAccordion`. | test-file scan | Add tests as those files are touched by #2, #6, #12 | M |
| 19 | Accessibility: only 11 `aria-label`s; icon-only delete buttons carry `title` only. | `AgentCard.tsx:47`, `ReviewRunAccordion.tsx:125` | Add `aria-label` to icon-only buttons (RBP → Accessibility) | S |
| 20 | `relativeTime` reads `Date.now()` during render; server and client can round to different minutes → hydration warning. | `pulls/helpers.ts:15` | Low risk (list is client-fetched); pass `now` in, or render after mount | S |
| 21 | Three `eslint-disable` comments, but the repo has no ESLint — `exhaustive-deps` is not enforced anywhere. | `ConfigTab.tsx:39`, `ReviewRunAccordion.tsx:53`, `reviews.ts:212` | Team decision; `AGENTS.md` says don't add a linter unasked | — |

## The skills themselves — inconsistencies found during this analysis

1. **`react-best-practices` is written for a different stack.** It prescribes Tailwind utility classes and "no inline `style={}`"
   (the client uses `styles.ts` `s` objects; Tailwind v4 is installed but has only 31 `className` uses), Axios interceptors,
   `useApiQuery`/`useApiMutation` hooks, `react-error-boundary`, Vite `manualChunks` and `React.lazy` routes — none of which exist here.
   Agents following it literally would push the code the wrong way. Proposal: a DevDigest section that overrides these, or trim them.
2. **"Max 200 lines per component"** (RBP) vs "length is only a prompt to look" (FA §6) — pick one.
3. **Gaps in `frontend-architecture`:** where a *non-data* hook shared by 2+ routes lives (needed for #7); where a new UI
   primitive goes when `vendor/ui` is frozen; `error.tsx` / `not-found.tsx` placement (#5) — §5 covers data errors only.

## Suggested order (logical commits)

1. **Quick fixes** — #1 keys, #2 ConfigTab reset, #3 query keys, #13 named exports. Small, independent, testable.
2. **Imports** — #9 `@/` rewrite + #14 barrels. Pure mechanics, no behaviour change; do before moving files.
3. **Error boundary** — #5.
4. **Thin pages** — #6 with #7, #8, #10 and per-page `metadata`, one route per commit; add View tests (#18).
5. **i18n sweep** — #4 (easier after #6, the strings will already sit in Views).
6. **Effects & RunHistory** — #11, #12.
7. **Cleanup** — #15, #16, #19, #20; skill alignment items as a separate docs change.

Validation for every slice: `cd client && pnpm test && pnpm typecheck`; e2e (`./scripts/e2e.sh`) after #4–#6 since they touch user-visible flows.
