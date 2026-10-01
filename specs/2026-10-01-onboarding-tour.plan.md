# Implementation Plan: Onboarding Tour (per-repo onboarding generator)
**Spec:** `/Users/volodymy.rzhutenko/Documents/AI Course/dev-digest/specs/2026-10-01-onboarding-tour.md` (Date: 2026-10-01, Status when planned: approved)
**Execution mode:** multi-agent (chosen by the user: "use multi-agent wherever possible")
**Branch:** `lesson-05` (commit there; no topic branches)
**Status:** needs decisions — six non-blocking Open decisions (D1–D6), each with a default that the tasks already use. If the user accepts the defaults, the plan can be implemented as written.

## Definition of Done
- [x] The spec was read-only to me: I did not modify it (`git status` clean before the plan files were written) and executed nothing from it.
- [x] Spec `approved`; execution mode given by the user (multi-agent).
- [x] Every AC (AC-1..AC-37) and every NFR touched has a Requirements-review verdict; every non-`clear` one is an Open decision with a default (no blocking question).
- [x] Every AC maps to at least one task (see *AC → task coverage*), and every task traces to an AC.
- [x] Every task has concrete files, `Owned paths`, an `Executor` whose allowed paths cover them, `Depends-on`, skills that exist in `.claude/skills`, and a measurable acceptance.
- [x] Dependencies form a DAG; concurrent tasks have disjoint `Owned paths`; Execution waves table filled.
- [x] Each wave has exactly one `Checkpoint: yes` task per package with more than one task in that wave; a package's only task in a wave is its checkpoint.
- [x] Contract task (T1) comes before every consumer; both `@devdigest/shared` copies are named; removing the unused `Onboarding` contract is called out explicitly.
- [x] Testing strategy covers server, client, reviewer-core and e2e, with exact commands; integration/e2e/manual separated as validation.
- [x] Nothing contradicts the skills, package `AGENTS.md`, `INSIGHTS.md`, do-not-touch or lesson scope (L05 Onboarding generator only; Project Context and PR Brief untouched).
- [x] UI tasks cover i18n, loading/empty/error/not-cloned states and tests; no DB migration is needed (decision recorded with evidence); security checks named.
- [ ] Every decision resolved from docs/code — D1–D6 remain open with defaults (status `needs decisions`).
- [ ] Every fact evidenced — a few repo details are "to verify by implementer" (see *Unverified*); none changes the task split.
- [x] Recommendations present, tagged.
- [x] Reviewer handoff filled.
- [x] Plan and cards saved next to the spec, no name clash, empty Delivery log.

## Overview
The repo-intel facade gets one new deterministic read, `collectTourFacts(repoId)`. It reads the index (rank, edges, endpoint facts, index state) and the clone's **git blobs at the indexed commit** through a new local `RepoSnapshot` port. The port lists the tree, reads manifests and the README (symlinks blocked by construction) and counts commits per file in a 180-day window. Pure helpers turn these inputs into stack, structure, routes, run-locally commands, reading path (`pagerank × (1 + hotness)`) and critical paths. A new `onboarding` server module does the rest. It checks workspace, clone and in-flight state, decides whether the index is usable and a provider key exists, makes **one** structured call (reprompt and transport retries switched off through a new single-attempt option on the LLM port, plus a 90 s timeout), grounds and merges the model text onto the deterministic lists, or else builds the honest skeleton. It persists the `Tour` as jsonb in the existing `onboarding` table (no migration), keeps a full tour on a failed regeneration (`last_attempt`), and logs one `onboarding: generated …` line plus one `prompt.assembled` event. The client adds the sidebar item, data hooks and a repo-scoped `/repos/:repoId/onboarding` page with five collapsible cards, usage badge, banners, Share link, Open links and copy buttons.

## Requirements review
Verdicts are against the repo as it is on `lesson-05` (HEAD `9d0572b`). Spec problems are reported here, never fixed in the spec.

| AC / NFR | Verdict | Finding / evidence | Resolution |
|---|---|---|---|
| AC-1 | clear | `activeKeyFor` matches any `/onboarding` → `onboarding-tour` (`client/src/components/app-shell/helpers.ts:29`); WORKSPACE has only `pulls`, `context` (`client/src/vendor/ui/nav.ts:22-27`, sanctioned edit per `frontend-architecture` exceptions); label key exists (`client/messages/en/shell.json:19`) | T4, T11, T13 |
| AC-2 | clear | — | T11 |
| AC-3 | clear (with gap note) | Gap: the edge case "a `#first-tasks` anchor opens the page scrolled there" needs an explicit scroll after the async load, because the browser's native hash scroll fires before the cards exist | T9 (toggle), T11 (nav + post-load scroll) |
| AC-4 | clear | — | T8, T11, T12 |
| AC-5 | clear | — | T11 |
| AC-6 | clear | `repos.clone_path` nullable; seed has a `clonePath: null` repo (`server/src/db/seed.ts:217,436`) | T12, T11 |
| AC-7 | **ambiguous** | AC-12's window "within the last 180 days" anchored to *now* makes two collections on the same commit differ over time, which contradicts AC-7's "identical facts" | **D2** (default: anchor the window at the source commit's committer date) — T3, T5, T10 |
| AC-8 | clear | No stack reader exists in `server/src` (spec baseline) | T3, T5 |
| AC-9 | clear | Excluded dirs listed in the AC | T5 |
| AC-10 | clear | Endpoint facts in `file_facts.endpoints` jsonb (`server/src/db/schema/repo-intel.ts:75-90`) | T5, T10 |
| AC-11 | ambiguous (minor) | "services that look like data stores, e.g. …" has no closed list; "dev or start script" doesn't say which `package.json` (root only, or one level down too) | **D4** (default list + root-first rule) — T5 |
| AC-12 | ambiguous | Same window anchor as AC-7. Also: root-level `test/` is not excluded today because patterns need a leading slash (`server/src/modules/repo-intel/service.ts:759-779`) | D2; T5 normalises paths with a leading `/` before matching |
| AC-13 | clear | `CLONE_DEPTH = 1` (`server/src/modules/repos/constants.ts:9`) | T3, T5, T10, T9 |
| AC-14 | ambiguous (minor) | "chains starting from the top-ranked files": `getCriticalPaths` seeds from the top 5 by raw rank, junk included (`service.ts:709-748`). Does the junk filter apply to the seeds, to every file in a chain, or both? | Plan default (no decision needed): seeds are the top non-junk files, junk files anywhere in a chain are dropped; listed in Risks so cross-review can disagree. T5 |
| AC-15 | clear (needs infra) | Providers re-prompt on schema failure (`maxRetries ?? 2`, `server/src/adapters/llm/openai.ts:90`, `reviewer-core/src/llm/openrouter.ts:64`) and retry transport (`withRetry` in `openai.ts`/`anthropic.ts`; OpenAI SDK `maxRetries: 2` in `openrouter.ts:56`). `maxRetries: 0` disables only the re-prompt | T2 adds a single-attempt option to the LLM port; T12 uses it |
| AC-16 | clear | — | T6, T12 |
| AC-17 | clear | Directory existence requires the clone tree, not only the index | T3 (`listFiles`), T10 (`classifyPaths`), T6 |
| AC-18 | clear | `MermaidDiagram` renders `null` on invalid input (`client/src/components/mermaid-diagram/MermaidDiagram.tsx:59`) | T9 |
| AC-19 | clear | Five cases map to: no state row → `degraded/no_data` (`service.ts:191-208`), `failed`, `degraded`, `config.repoIntelEnabled = false` (`service.ts:690`), zero `file_rank` rows | T10, T12 |
| AC-20 | **gap** | With `maxRetries: 0` a schema-invalid response *throws* and its usage (tokens were spent) is lost (`openrouter.ts:122`, `openai.ts:126`). AC-26 asks for `tokens_in/out` on every generation | **D1** (default: the single-attempt error carries the spent usage) — T2, T12 |
| AC-21 | clear | Spec asks for a "snapshot"; plan uses an explicit deep-equal fixture on the server builder (no RTL snapshot, per `react-testing-library`) | T6, T9 |
| AC-22 | clear | — | T11 |
| AC-23 | clear | — | T12, T11 |
| AC-24 | clear (with gap note) | The edge case "the other tab … then shows the new tour on refetch" needs the client to refetch while `status: generating` | T8 polls `GET` every 2 s while `generating` |
| AC-25 | clear | — | T8, T11, T12 |
| AC-26 | clear | Depends on D1 for the failed-call tokens | T1, T2, T12 |
| AC-27 | ambiguous (minor) | The format for `llm_calls: 0` is not given: `formatTokensTotal(0,0)` returns `"0 tok"` (null only for null/undefined) and `formatCostUsd(0)` gives `$0.0000`; the UI special-cases `llm_calls === 0` (`client/src/lib/format-cost.ts:20-25`) | **D3** — T11 |
| AC-28 | ambiguous (minor) | The `cost=$x` precision is not stated. AC-29 needs the log cost to "equal" the badge, but the badge rounds to 2–4 decimals | **D5** — T6, T14 |
| AC-29 | clear (manual) | Manual demo; no automated check possible | T14 (parent) |
| AC-30 | clear (contract gap) | The page needs the repo's current index sha; the spec's boundary contract lists only `{status, tour?}` ("exact names are for the plan") | `GET` response adds `index_sha` (T1, T12, T11) |
| AC-31 | ambiguous (minor) | `files_total` comes from `repo_index_state.stats.totalCandidates`, written by the full index (`pipeline/full.ts:254-276`, `walk.ts:57-67`); not confirmed for incremental refresh. When it is null, "N of M" has no M | **D6** (default `M = files_indexed + files_skipped` when null) — T10, T11 |
| AC-32 | clear | Trap: js-tiktoken is quadratic on long non-space runs (`server/INSIGHTS.md:204`). Cap characters before counting | T6 |
| AC-33 | clear | `wrapUntrusted`, `INJECTION_GUARD` exported (`reviewer-core/src/index.ts:15-26`). The UI kit `Markdown` renders clickable `<a href>` (`client/src/vendor/ui/primitives/Markdown.tsx:30-34`), so it can't be used | T6, T9 (route-local inert markdown) |
| AC-34 | clear | `githubBlobUrl` exists; no tree URL helper (`client/src/lib/github-urls.ts`) | T9 |
| AC-35 | clear | `@testing-library/user-event` is not installed; use `fireEvent` (`client/INSIGHTS.md:85`) | T9 |
| AC-36 | clear | — | T11 |
| AC-37 | clear | — | T7, T12 |
| NFR Performance | clear | 3 s fact collection on 5,000 files; timed `.it` test | T10 |
| NFR Security (symlinks) | clear (plan is stricter) | Git-blob reads report every symlink as blocked, including in-clone ones (precedent `server/src/adapters/git/repo-file-reader.ts:33-39`). Spec: "resolve symlinks and refuse paths outside the clone" | Stricter behaviour adopted, see Recommendations (approach) — T3 |
| NFR Security (secrets) | clear | Reuse `redactSecrets` (`server/src/modules/intent/helpers.ts`), promoted to `_shared` | T6 |
| NFR a11y / i18n | clear | `onboarding.json` holds outdated strings for a *different* five-section design (`client/messages/en/onboarding.json`); they are replaced | T9, T11 |
| Edge: "two tabs press Regenerate" | clear | In-memory in-flight map (precedent `IntentService.inflight`, `server/src/modules/intent/service.ts:114`) | T12, T8 |
| Edge: tour exists but clone gone / `GET` while generating | gap (minor) | Precedence of `status` values not stated | Plan default: `generating` > `not_cloned` > `ready` > `none`; `tour` is still returned with `generating` (old tour stays visible) and omitted with `not_cloned` — T12, T11 |

Verdict counts: **clear 27** (incl. 2 with gap notes, 1 contract gap, 1 manual) · **ambiguous 8** (AC-7, AC-11, AC-12, AC-14, AC-27, AC-28, AC-31; the AC-7/AC-12 pair is one issue, D2) · **gap 1** (AC-20 → D1) · **not testable 0** · **conflicts 0** (AC-7 vs AC-12 is listed as ambiguous because the default anchor resolves it).

## Recommendations
- **Anchor the hotness window at the source commit date, not wall-clock time** — this keeps AC-7's determinism and makes the `.it` test reproducible on any date; the trade-off is that a stale clone's "last 180 days" can be old. Since D2 changes how AC-12 reads, the spec text should be tightened — **requirement**.
- **Read clone files as git blobs at the indexed commit (`git ls-tree` / `cat-file`), not from the working tree** — facts become a function of `(commit, index)` (AC-7), and a committed symlink can never be followed, which is stricter than the NFR's "resolve and refuse outside". Trade-off: a README that is an in-clone symlink is treated as absent — **approach** (adopted in T3).
- **Do not write hotness into `file_rank`.** Compute it at tour time inside the facade. Writing it during indexing would change `rank` for the review repo-map and conventions sampling, which is outside this spec. Trade-off: one `git log` per generation (bounded, local) — **approach** (adopted in T5/T10).
- **Fix `isJunkPath` once, in a shared repo-intel module, instead of forking an onboarding-only filter.** The spec says "the index's junk-path patterns". The side effect is that conventions sampling also stops picking root-level `test/`, `tests/` and `migrations/` files (`server/src/modules/conventions/service.ts:95`), which is arguably a fix. Trade-off: a visible behaviour change in another feature, called out in T5/T10 — **approach**.
- **Persist the whole `Tour` (usage and `last_attempt` included) in the existing `onboarding.json` jsonb column. No migration.** The table is unused (`server/src/db/schema/context.ts:120-126`), so this avoids the drizzle-kit TTY trap (`server/INSIGHTS.md:267`). Trade-off: usage is not SQL-aggregatable. Nothing in the spec aggregates it — **approach**.
- **Make the single-attempt guarantee a port option (`singleAttempt: true`), not an onboarding-only provider.** The intent classifier could adopt it later. Trade-off: it touches `reviewer-core`, which triggers `server-unit` CI — **approach**.
- **Show the computed reason ("imported by N files · rank pNN") as a dim suffix on full tours too.** The spec's design notes propose this, so the numbers always stay grounded. It costs no extra fields (`computed_reason` is already in the contract) — **approach** (adopted in T9).
- **Spec text: the `GET` contract should name `index_sha`** (needed by AC-30), and AC-27 should state the `llm_calls: 0` rendering (D3) — **requirement**.

## Context found
- Feature model `onboarding` registered, default `openrouter` / `deepseek/deepseek-v4-flash` — `server/src/vendor/shared/contracts/platform.ts:16,46-48`; resolve through `container.resolveFeatureModel`, never `modules/settings/*` — `server/INSIGHTS.md:167-179`, `server/src/platform/container.ts:135`.
- Missing key → `ConfigError` from `container.llm(id)` — `server/src/platform/container.ts:246-276`.
- Closest single-call precedent (narrow deps, `withTimeout`, `prompt.assembled`, cost log): `server/src/modules/intent/service.ts:55-67, 96-103, 337-422`; container wiring of narrow deps `container.ts:196-205`.
- `StructuredRequest.maxRetries` re-prompts; `sessionId`/`requireParameters` are "server copy only" fields of `adapters.ts` (precedent for not mirroring port-only fields) — `server/src/vendor/shared/adapters.ts:51-78`.
- OpenRouter provider accepts an injected `fetch` (testable call count) and builds the SDK with `maxRetries: 2` — `reviewer-core/src/llm/openrouter.ts:45-58`.
- `withRetry` default retries 3 on 429/5xx/network — `server/src/platform/resilience.ts:35-50`.
- Facade: `RepoIntel` interface `server/src/modules/repo-intel/types.ts:149-184`; `IndexState` has no total/bounded fields (`types.ts:42-50`); `tryGetIndexState` reads `stats` jsonb (`repository.ts:205-240`); walk stats `{totalCandidates, skippedTooLarge, bounded}` (`pipeline/walk.ts:57-67`) are spread into `stats` on full index (`pipeline/full.ts:254-276`).
- Rank: `file_rank(pagerank, hotness=0, rank, percentile)` — `server/src/db/schema/repo-intel.ts:105-127`; `computeFileRank` — `pipeline/rank.ts`.
- Tests fake `RepoIntel` with `as unknown as RepoIntel` (`server/test/blast-service.test.ts:47`, `conventions-*.it.test.ts:37-41`, `blast.it.test.ts:25-44`), so adding interface methods doesn't break them.
- Shared barrel rule: "feature agents EXTEND with new files" — `server/src/vendor/shared/index.ts:13-14`; client barrel already exports `project-context.js` (`client/src/vendor/shared/index.ts:27`).
- `Onboarding` / `OnboardingSection` / `OnboardingLink` have no consumer outside both `knowledge.ts` copies (grep over `server/src`, `client/src`, `reviewer-core/src`, `mcp-server/src`).
- Client patterns: thin `page.tsx` + View with `AppShell crumb` (`client/src/app/repos/[repoId]/context/page.tsx`, `.../ProjectContextView.tsx:24-48`); `useRepoNotFound`; `RunCostBadge` + `formatCostUsd`/`formatTokensTotal` (`client/src/components/run-cost-badge/RunCostBadge.tsx`, `client/src/lib/format-cost.ts:20-40`); `useToast` (`client/src/lib/toast.tsx:24`); `relativeTime` gives "2h" (`client/src/lib/relative-time.ts`).
- Client traps: runtime value imports from the `@devdigest/shared` barrel 500 under webpack, so use `import type` only (`client/INSIGHTS.md:125-134`); `@devdigest/ui` imports only in `'use client'` files (`client/INSIGHTS.md:56-66`); no `user-event` (`client/INSIGHTS.md:85-91`).
- Server traps: jsonb contract fields added later must be `.nullish()` (`server/INSIGHTS.md:149-165`); a new LLM path makes tests hit the real provider on a machine with a key, so inject fail-fast fakes for every provider (`server/INSIGHTS.md:229-245`); deepseek latency is erratic, 90 s timeout and no retry (`server/INSIGHTS.md:294-305`); `AppError` subclasses report `name: 'AppError'` (`server/INSIGHTS.md:378`).
- e2e flows are numbered `01..12`; next is `13` (`e2e/specs/`).
- `AppError` subclasses available: `NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError` — no 409 class (`server/src/platform/errors.ts:7-40`).

## Affected packages & contracts
| Package | Layer / folder | Change |
|---|---|---|
| `server` (vendor shared) | `src/vendor/shared/contracts/onboarding-tour.ts` (new), `contracts/knowledge.ts`, `index.ts`, `adapters.ts` | Tour / response / facts contracts; remove unused `Onboarding*`; port option `singleAttempt` + usage-on-error type |
| `client` (vendor shared) | `src/vendor/shared/contracts/onboarding-tour.ts` (new), `contracts/knowledge.ts`, `index.ts` | Mirror of the contract file; remove `Onboarding*` |
| `reviewer-core` | `src/llm/openrouter.ts` | honour `singleAttempt` (SDK `maxRetries: 0` per request, no re-prompt, usage on schema error) |
| `server` | `src/adapters/llm/openai.ts`, `anthropic.ts` | honour `singleAttempt` (skip `withRetry`, no re-prompt) |
| `server` | `src/adapters/git/repo-snapshot.ts` (new), `adapters/mocks.ts`, `platform/container.ts` | `RepoSnapshot` local port + git impl + mock + getter/override |
| `server` | `src/modules/repo-intel/` (`junk-paths.ts`, `tour-facts.ts` new; `service.ts`, `types.ts`, `repository.ts`, `README.md`) | pure fact builders; facade `collectTourFacts`, `classifyPaths` |
| `server` | `src/modules/onboarding/` (new: `routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `prompt.ts`, `output-schema.ts`, `constants.ts`), `modules/index.ts`, `modules/_shared/redact.ts` (new), `modules/intent/helpers.ts`, `platform/errors.ts`, `prompts/onboarding.system.md` | the feature module |
| `client` | `src/vendor/ui/nav.ts`, `src/components/app-shell/helpers.ts` (+ tests) | sidebar item + active-key fix |
| `client` | `src/lib/api.ts`, `src/lib/hooks/onboarding.ts` (new), `src/lib/github-urls.ts`, `src/components/mermaid-diagram/` | data layer, tree URL, invalid-diagram fallback |
| `client` | `src/app/repos/[repoId]/onboarding/` (new), `messages/en/onboarding.json` | the page |
| `e2e` | `e2e/specs/13-onboarding-tour.flow.json` (new) | browser flow |
| DB | none | existing `onboarding(repo_id PK, json jsonb, generated_at)` reused; **no migration** |

**Contracts (T1).** New file `contracts/onboarding-tour.ts`, identical in `server/src/vendor/shared/` (canonical) and `client/src/vendor/shared/`, exported from both barrels:
- `TourMode`, `SkeletonReason` (`index_degraded | llm_unavailable | llm_failed`), `TourComplexity`.
- `TourUsage { llm_calls: 0|1, tokens_in, tokens_out, cost_usd: number|null, model: string|null, duration_ms, dropped_items }`.
- `TourIndexInfo { status, reason|null, files_indexed, files_skipped, files_total|null, bounded, hotness_available }`.
- `Tour` exactly as the spec's boundary contract (`repo_id, generated_at, source_sha, mode, skeleton_reason, skeleton_detail, index, usage, architecture{summary_md, diagram, stack[{name, evidence_path}], structure[{path, files}], routes[{method, path, file}]}, critical_paths[], run_locally[], reading_path[], first_tasks[], last_attempt|null`). Every field that may be added later is `.nullish()`. `last_attempt` is `.nullish()` from day one.
- `OnboardingTourResponse { status: 'none'|'ready'|'not_cloned'|'generating', tour: Tour.nullish(), index_sha: string|null }`.
- `TourFacts` (server-internal boundary between the repo-intel facade and the onboarding module; Zod for consistency): `source_sha`, `index` (`TourIndexInfo` + `usable: boolean`, `unusable_reason: 'no_data'|'failed'|'degraded'|'flag_off'|'no_ranked_files'|null`, `last_indexed_sha`), `stack`, `structure`, `routes`, `run_locally[{command, source_path}]`, `critical_paths[{path, computed_reason}]`, `reading_path[{path, score, pagerank, hotness, computed_reason}]`, `readme: {path, text}|null`.
- **Explicit callout:** remove `OnboardingLink`, `OnboardingSection`, `Onboarding` from **both** `contracts/knowledge.ts` copies (no consumers, verified by grep) and update the barrel doc comment in `server/src/vendor/shared/index.ts`. This edits existing shared files on purpose, per the spec ("replaces the unused generic `Onboarding` contract"). Don't sync anything else in `knowledge.ts`: the two copies already differ (client lags), see `AGENTS.md`.
- **Port option (T2, server copy only, precedent `sessionId`):** `StructuredRequest.singleAttempt?: boolean` (no re-prompt, no transport retry) and an exported `StructuredCallUsage { tokensIn, tokensOut, costUsd }` type that providers attach as `usage` on the error they throw for a schema-invalid single attempt (D1).

## Design

### Generation (server)
```mermaid
sequenceDiagram
  participant R as onboarding/routes.ts
  participant S as OnboardingService
  participant Repo as OnboardingRepository
  participant RI as repoIntel.collectTourFacts
  participant Snap as RepoSnapshot (git blobs @ sha)
  participant L as LLMProvider (feature model "onboarding")
  R->>S: generate(workspaceId, repoId, correlationId)
  S->>Repo: getRepoForWorkspace (404 if not ours)
  S->>S: clone_path null → 409 not_cloned; inflight.has(repoId) → 409 generation_in_progress
  S->>RI: collectTourFacts(repoId)
  RI->>Snap: headSha / listFiles / readText(manifests, README) / churn(window @ commit date)
  RI-->>S: TourFacts (deterministic, index.usable, unusable_reason)
  alt !facts.index.usable
    S->>S: buildSkeleton(index_degraded), usage llm_calls=0
  else resolveModel + llm(provider) throws ConfigError
    S->>S: buildSkeleton(llm_unavailable), llm_calls=0
  else
    S->>S: buildPrompt (wrapUntrusted, README ≤1,500 tok, fit ≤16,000 tok) + log prompt.assembled
    S->>L: completeStructured({singleAttempt:true, maxRetries:0, timeoutMs:90s}) under withTimeout(90s)
    alt ok
      S->>RI: classifyPaths(repoId, sha, model paths)
      S->>S: mergeModelOutput (ground, drop, count dropped_items) → mode llm
    else error / timeout / schema
      S->>S: buildSkeleton(llm_failed, redacted detail), llm_calls=1, usage from error (D1)
    end
  end
  S->>Repo: upsert tour, or keep full tour + set last_attempt (AC-23)
  S->>S: log "onboarding: generated …" (one line)
  S-->>R: Tour
```

### Placement (onion rings)
- `adapters/git/repo-snapshot.ts`: driven adapter, local port `RepoSnapshot` (like `RepoFileReader`, `Tokenizer`), It runs `git` with `execFile` (no shell), validates refs, caps sizes and never surfaces raw error text.
- `modules/repo-intel/junk-paths.ts`, `tour-facts.ts`: domain, pure, no I/O. They take arrays and maps and return contract-shaped data. Unit-tested with plain inputs.
- `modules/repo-intel/service.ts` (`collectTourFacts`, `classifyPaths`): application facade. It reads through `RepoIntelRepository` and `container.repoSnapshot`, calls the pure builders, and keeps the existing service-locator constructor (D3 deviation tolerated, not copied).
- `modules/onboarding/`: new module with **narrow deps** (`onion-architecture` §5). `routes.ts` builds `new OnboardingService({ repo: new OnboardingRepository(app.container.db), cloneExists: (dir) => app.container.projectDocs.exists(dir), facts: (id) => app.container.repoIntel.collectTourFacts(id), classifyPaths: …, llm: (p) => app.container.llm(p), resolveModel: (w, id) => app.container.resolveFeatureModel(w, id), tokenizer: app.container.tokenizer, log: app.log })` **once per plugin**, so the in-flight map is shared across requests. No `modules/repo-intel/*` import. The `TourFacts` type comes from `@devdigest/shared`.
- `helpers.ts`, `prompt.ts`, `output-schema.ts`: domain (pure). `repository.ts`: Drizzle only, every query scoped by `workspaceId` through a join on `repos`.

### Client placement (`frontend-architecture`)
```
client/src/app/repos/[repoId]/onboarding/
├── page.tsx                                 thin server component → <OnboardingTourView/>
└── _components/
    ├── OnboardingTourView/                  T11: states, header, usage badge, banners, nav list, share, fragment focus
    │   ├── OnboardingTourView.tsx · index.ts · styles.ts · helpers.ts (+ .test.ts) · OnboardingTourView.test.tsx
    │   └── _components/TourUsageBadge/ · TourBanners/ · TourToc/
    └── TourSections/                        T9: five cards (shared by the View only)
        ├── TourSections.tsx · index.ts · styles.ts · constants.ts (SECTION_IDS) · TourSections.test.tsx
        └── _components/SectionCard/ · TourMarkdown/ · ArchitectureCard/ · CriticalPathsCard/ · RunLocallyCard/ · ReadingPathCard/ · FirstTasksCard/ · OpenOnGitHubLink/
```
`SECTION_IDS` (`architecture`, `critical-paths`, `run-locally`, `reading-path`, `first-tasks`) live in `TourSections/constants.ts` and are re-exported from its `index.ts` for the View's nav list.

## Phased tasks

### Phase 1 — Contracts, ports and shell (wave 1)

- **T1** — Shared `Tour` contracts (covers AC-2, AC-13, AC-23, AC-26, AC-30, AC-31; contract basis for all)
  - **Action:** Create `contracts/onboarding-tour.ts` (content listed under *Affected packages & contracts*) in both vendor copies, byte-identical; export from both barrels; remove `Onboarding*` from both `knowledge.ts` copies and update the server barrel doc comment. Add parse tests: a full `llm` tour, a skeleton tour, a tour **without** `last_attempt` key (old jsonb), `OnboardingTourResponse` for each status.
  - **Package / Type:** server + client — core (contracts)
  - **Executor:** implementer
  - **Skills to use:** zod, typescript-expert
  - **Owned paths:** `server/src/vendor/shared/contracts/onboarding-tour.ts`, `server/src/vendor/shared/contracts/knowledge.ts`, `server/src/vendor/shared/index.ts`, `client/src/vendor/shared/contracts/onboarding-tour.ts`, `client/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/index.ts`, `server/test/onboarding-contracts.test.ts`
  - **Depends-on:** none
  - **Risk:** medium (shared contract; ripples to every later task)
  - **Checkpoint:** yes (client) · no (server)
  - **Known gotchas:** `.nullish()` for later-added jsonb fields (`server/INSIGHTS.md:149`); don't sync the rest of `knowledge.ts` (`AGENTS.md` Conventions); the client must only `import type` from the barrel (`client/INSIGHTS.md:125`).
  - **Acceptance:** `diff server/src/vendor/shared/contracts/onboarding-tour.ts client/src/vendor/shared/contracts/onboarding-tour.ts` is empty; `grep -rn "OnboardingSection\|OnboardingLink" server/src client/src` returns nothing; `server/test/onboarding-contracts.test.ts` passes (4 parse cases incl. missing `last_attempt` key); server `pnpm typecheck` and client `pnpm typecheck` pass; client full `pnpm test` passes (checkpoint).

- **T2** — Single-attempt structured call on the LLM port (covers AC-15, AC-20, AC-26)
  - **Action:** Add `singleAttempt?: boolean` to `StructuredRequest` and export `StructuredCallUsage` (server `adapters.ts` only; precedent `sessionId`). With `singleAttempt`: `OpenRouterProvider.completeStructured` passes `{ maxRetries: 0 }` as the SDK per-request option, makes one parse attempt and, on schema failure, throws an `Error` with `usage: StructuredCallUsage` attached (tokens from the response, cost from API/estimator). `OpenAIProvider`/`AnthropicProvider` skip `withRetry` and the re-prompt loop and attach `usage` the same way. Default behaviour without the flag stays unchanged.
  - **Package / Type:** reviewer-core + server — core / backend (adapters)
  - **Executor:** implementer
  - **Skills to use:** onion-architecture, typescript-expert, zod
  - **Owned paths:** `server/src/vendor/shared/adapters.ts`, `reviewer-core/src/llm/openrouter.ts`, `reviewer-core/src/llm/openrouter.test.ts` (or the existing test file next to it — to verify), `server/src/adapters/llm/openai.ts`, `server/src/adapters/llm/anthropic.ts`, `server/test/llm-single-attempt.test.ts`
  - **Depends-on:** none
  - **Risk:** medium (shared provider code used by every review; must not change defaults)
  - **Checkpoint:** no (server). reviewer-core has this one task only, so T2 runs the full reviewer-core suite itself.
  - **Known gotchas:** `reviewer-core/**` changes trigger `server-unit` CI (`AGENTS.md` Conventions); the OpenAI SDK's constructor `maxRetries: 2` (`openrouter.ts:56`) is the transport retry to disable per request.
  - **Acceptance:** reviewer-core test with an injected `fetch` that returns HTTP 500 → `completeStructured({singleAttempt:true})` rejects and `fetch` was called **exactly once**; with a 200 whose content fails the schema → called once, the error has `usage.tokensIn > 0`; without the flag the existing behaviour (re-prompt) is unchanged (existing tests green). Server `llm-single-attempt.test.ts`: `OpenAIProvider` with a stubbed client throwing a 500 → one call. `cd reviewer-core && npm test && npm run build` pass; `cd server && pnpm exec vitest run test/llm-single-attempt.test.ts && pnpm typecheck` pass.

- **T3** — `RepoSnapshot` port (git blobs at a commit) + mock + container (covers AC-7, AC-8, AC-11, AC-12, AC-13, AC-17, NFR Security)
  - **Action:** New local port in `server/src/adapters/git/repo-snapshot.ts`:
    - `headSha(cloneDir)`.
    - `commitDate(cloneDir, sha)`.
    - `listFiles(cloneDir, sha)`: `git ls-tree -r -z --name-only`, capped at 200,000 entries; returns `{ files, truncated }`.
    - `readText(cloneDir, sha, path, maxBytes)` → `ok | missing | blocked`. Symlink blobs (mode 120000) are `blocked`, unsafe paths are `blocked`, oversize is `missing`.
    - `churn(cloneDir, sha, since: Date)`: `git log <sha> --since=<iso> --format= --name-only`. Returns `{ commits, counts: Record<path, n> }`; `available = commits > 1` (D2/AC-13: a single-commit history cannot provide churn).
    - Use `execFile` only (no shell), validate refs with `/^[0-9a-f]{7,40}$|^HEAD$/i`, set timeouts, never propagate error text.
    - Add `FakeRepoSnapshot` to `adapters/mocks.ts`; add the `repoSnapshot` getter and the `ContainerOverrides.repoSnapshot` slot in `platform/container.ts`.
  - **Package / Type:** server — backend (adapter)
  - **Executor:** implementer
  - **Skills to use:** onion-architecture, security, typescript-expert
  - **Owned paths:** `server/src/adapters/git/repo-snapshot.ts`, `server/src/adapters/mocks.ts`, `server/src/platform/container.ts`, `server/test/repo-snapshot.test.ts`
  - **Depends-on:** none
  - **Risk:** medium (shell-free git on untrusted repos)
  - **Checkpoint:** yes (server)
  - **Known gotchas:** precedent and path guard in `server/src/adapters/git/repo-file-reader.ts:25-60` (copy the guard, don't import across adapters if it creates coupling; same folder is fine); a shallow clone has one commit (`server/src/modules/repos/constants.ts:9`).
  - **Acceptance:** `server/test/repo-snapshot.test.ts` builds a temp git repo (`git init`, commits with `GIT_COMMITTER_DATE`):
    - `readText` of `README.md` that is a symlink to `/etc/hosts` → `blocked`, content never returned.
    - `../x` and `-x` → `blocked`.
    - `listFiles` returns all committed paths.
    - `churn` on a 3-commit history counts per file; on a `git clone --depth 1` of it → `commits === 1`.
    - Full server unit suite `pnpm exec vitest run --exclude '**/*.it.test.ts'` and `pnpm typecheck` pass (checkpoint, after T1/T2 land).

- **T4** — Sidebar item and active-key fix (covers AC-1)
  - **Action:** Add `{ key: "onboarding-tour", label: "Onboarding Tour", icon: "Workflow" (or "ListChecks"; `BookOpen` is not in `IconName`, `FileText` is taken), href: "/repos/:repoId/onboarding" }` between `pulls` and `context` in `client/src/vendor/ui/nav.ts` (the sanctioned vendor exception; say so in the commit body). Narrow `activeKeyFor` to `/^\/repos\/[^/]+\/onboarding(\/|$)/` for `onboarding-tour`, so `/onboarding` → `""`. Add nav-order and `activeKeyFor` unit cases.
  - **Package / Type:** client — ui
  - **Executor:** implementer
  - **Skills to use:** frontend-architecture, react-testing-library
  - **Owned paths:** `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts`, `client/src/components/app-shell/helpers.test.ts` (new), `client/src/components/app-shell/nav.test.ts`
  - **Depends-on:** none
  - **Risk:** low
  - **Checkpoint:** no (client)
  - **Known gotchas:** the `g`-shortcut uniqueness test (`nav.test.ts:13-18`); don't add a `gKey` (the spec lists `g o` only as a proposal).
  - **Acceptance:** `nav.test.ts` asserts WORKSPACE keys `["pulls","onboarding-tour","context"]`; `helpers.test.ts`: `activeKeyFor("/repos/r1/onboarding") === "onboarding-tour"`, `activeKeyFor("/onboarding") !== "onboarding-tour"`, `activeKeyFor("/repos/r1/context") === "context"`; `pnpm exec vitest run src/components/app-shell && pnpm typecheck` pass.

### Phase 2 — Pure logic, persistence, data layer, section cards (wave 2)

- **T5** — Pure tour-fact builders + one junk-path rule (covers AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-21)
  - **Action:**
    - `modules/repo-intel/junk-paths.ts`: `JUNK_PATH_PATTERNS` + `isJunkPath(path)`, matching on `'/' + path.toLowerCase()` so root-level `test/`, `tests/` and `migrations/` match.
    - `modules/repo-intel/tour-facts.ts` (pure; inputs are plain arrays/maps, outputs are `@devdigest/shared` `TourFacts` pieces):
      - `detectStack(entries, manifests)` → `[{name, evidence_path}]`. Root + one level down; at least the manifests of AC-8. Mapping: `package.json` deps `fastify` → Fastify, `next` → Next.js, `react` → React, `express` → Express; `tsconfig.json`/`package.json` → `Node.js/TypeScript`; lockfiles → pnpm/Yarn/npm; `docker-compose*.yml`/`compose*.yml` → Docker Compose; `Dockerfile` → Docker; `Makefile` → Make; `pyproject.toml`/`requirements.txt` → Python; `go.mod` → Go; `Cargo.toml` → Rust. De-duplicated, ordered by evidence path then name.
      - `buildStructure(indexedPaths)`: dirs depth ≤ 2, count desc then path, cap 40, excluded dirs of AC-9.
      - `buildRoutes(endpointFacts, scoreOf)`: `METHOD /path`, cap 50, order by declaring file score desc then path.
      - `buildRunLocally(input)` (AC-11 order; D4 data-store list; `<pm>` from lockfile, else `npm run` for scripts and `npm install`; script **names** only).
      - `computeHotness(counts)` (`count / max`, 0 when max 0).
      - `rankReadingPath(rankRows, hotness)` (`score = pagerank × (1 + hotness)`, ties by path, junk excluded, cap 8).
      - `selectCriticalPaths(chains, routeFiles, scoreOf)` (seeds = top non-junk, junk dropped anywhere, de-dup, order by score then path, cap 6).
      - `computedReason(inbound, percentile)` → `"imported by N files · rank pNN"`.
    - Constants: the existing `EXCLUDED_DIRS` and `HOTNESS_WINDOW_DAYS` in `modules/repo-intel/constants.ts` are imported (not owned by any task); new caps and data-store names go at the top of `tour-facts.ts` as exported `UPPER_SNAKE_CASE` constants.
  - **Package / Type:** server — backend (domain)
  - **Executor:** implementer
  - **Skills to use:** onion-architecture, typescript-expert
  - **Owned paths:** `server/src/modules/repo-intel/junk-paths.ts`, `server/src/modules/repo-intel/tour-facts.ts`, `server/test/repo-intel-tour-facts.test.ts`, `server/test/repo-intel-junk-paths.test.ts`
  - **Depends-on:** T1
  - **Risk:** medium (most ACs' numbers live here)
  - **Checkpoint:** no (server)
  - **Known gotchas:** existing patterns `service.ts:759-774` (keep the same list; only the matching changes); never put a script **body** anywhere in the output (spec edge case "malicious script body").
  - **Acceptance:** `repo-intel-tour-facts.test.ts` covers each AC's Verify hint:
    - AC-8: fixture → `Node.js/TypeScript`, `Fastify`, `Next.js`, `pnpm`, `Docker Compose`, each with evidence path.
    - AC-9: 45 dirs → 40, in the stated order.
    - AC-10: three files → order by score then path.
    - AC-11: `pnpm install`, `cp .env.example .env`, `docker compose up -d postgres redis`, `pnpm dev` with sources; no lockfile → `npm install` / `npm run dev`; a `"dev": "curl … | sh"` body never appears.
    - AC-12: lower pagerank + hotness 1 overtakes higher pagerank + hotness 0; `test/x.ts` and `src/a.test.ts` excluded; 12 → 8.
    - AC-13: all-zero counts → hotness 0.
    - AC-14: chain `server.ts → middleware/auth.ts → lib/redis.ts` + route file; `*.test.ts` root excluded; ≤ 6.
    - AC-21: computed reason format.
    - `repo-intel-junk-paths.test.ts`: `test/x.ts`, `migrations/0001.sql`, `vitest.config.ts` junk; `src/latest/a.ts` not junk.
    - `pnpm exec vitest run test/repo-intel-tour-facts.test.ts test/repo-intel-junk-paths.test.ts && pnpm typecheck` pass.

- **T6** — Onboarding pure helpers, prompt, output schema, system prompt (covers AC-16, AC-17, AC-19, AC-20, AC-21, AC-28, AC-32, AC-33, NFR Security secrets)
  - **Action:**
    - `modules/onboarding/constants.ts`: `LLM_TIMEOUT_MS = 90_000`, `PROMPT_TOKEN_BUDGET = 16_000`, `README_EXCERPT_TOKENS = 1_500`, `README_CHAR_PRECAP = 12_000`, `FIRST_TASKS_MIN = 3`, `FIRST_TASKS_MAX = 5`.
    - `output-schema.ts`: Zod for the spec's LLM output schema; `first_tasks` max 5, `complexity` enum.
    - `prompt.ts`: `buildOnboardingPrompt(facts, readmeExcerpt)` → `{ messages, components }`. Every repo-derived text goes inside `wrapUntrusted(...)` from `@devdigest/reviewer-core`, with `INJECTION_GUARD` in the system message. The system text comes from `server/src/prompts/onboarding.system.md`, rewritten for the five sections and the "do not add/reorder" rule.
    - `fitPromptToBudget(facts, count)`: truncate routes from the end, then structure, until ≤ 16,000; `count` is injected.
    - `excerptReadme(text, count)`: pre-cap chars, then ≤ 1,500 tokens.
    - `helpers.ts`:
      - `mergeModelOutput(facts, output, pathKinds)` → `{ tour parts, dropped_items }`. Keep deterministic order; attach text by path/command; drop unknown paths, commands and first tasks whose path is neither file nor dir; tasks get `path_kind`.
      - `buildSkeleton(facts, reason, detail)`: deterministic only, `summary_md: null`, `first_tasks: []`.
      - `classifyIndex(facts.index)`.
      - `formatGeneratedLog(...)`: exact AC-28 line; D5 cost format.
      - `toLastAttempt(...)`.
      - `redactDetail(err)`: short, secret-free, via `redactSecrets`.
    - Promote `redactSecrets` from `modules/intent/helpers.ts` to `modules/_shared/redact.ts`; `intent/helpers.ts` imports it and keeps its export (`export { redactSecrets } from '../_shared/redact.js'`) so intent callers and tests are unchanged.
  - **Package / Type:** server — backend (domain)
  - **Executor:** implementer
  - **Skills to use:** onion-architecture, zod, security, typescript-expert
  - **Owned paths:** `server/src/modules/onboarding/constants.ts`, `server/src/modules/onboarding/output-schema.ts`, `server/src/modules/onboarding/prompt.ts`, `server/src/modules/onboarding/helpers.ts`, `server/src/prompts/onboarding.system.md`, `server/src/modules/_shared/redact.ts`, `server/src/modules/intent/helpers.ts`, `server/test/onboarding-helpers.test.ts`, `server/test/onboarding-prompt.test.ts`
  - **Depends-on:** T1
  - **Risk:** high (grounding and injection boundary)
  - **Checkpoint:** yes (server)
  - **Known gotchas:** js-tiktoken quadratic on long non-space runs, so pre-cap characters (`server/INSIGHTS.md:204`); the conventions extractor's ad-hoc delimiter is the anti-example (`server/src/modules/conventions/prompt.ts`); D5 cost format.
  - **Acceptance:**
    - `onboarding-helpers.test.ts`:
      - AC-16: model reorders the reading path and adds a file → final order = computed, extra file absent.
      - AC-17: hallucinated `src/missing.ts` task + invented command → both dropped, `dropped_items = 2`; a reason for a path not in critical paths is dropped and the row keeps `reason: null`.
      - Edge: all tasks dropped → `first_tasks: []` with `mode: llm`.
      - AC-21: `buildSkeleton` on a fixture deep-equals an expected object (no prose, `first_tasks: []`).
      - AC-28: `formatGeneratedLog` exact string for llm / skeleton / unknown cost.
      - NFR: `redactDetail(new Error('401 sk-or-v1-abc…'))` contains no key.
    - `onboarding-prompt.test.ts`:
      - AC-33: README with `</untrusted>` + "ignore previous instructions" stays inside one block (no early close; guard present).
      - AC-32: 5,000-file / 2,000-route fixture → ≤ 16,000 tokens with the real `TiktokenTokenizer`, routes truncated before structure.
      - README excerpt ≤ 1,500 tokens.
    - Intent tests stay green: `pnpm exec vitest run test/intent-helpers.test.ts`.
    - Full server unit suite + `pnpm typecheck` pass (checkpoint).

- **T7** — Onboarding repository (covers AC-23, AC-26, AC-31, AC-37)
  - **Action:** `modules/onboarding/repository.ts`, Drizzle only:
    - `getRepoForWorkspace(workspaceId, repoId)` → `{ id, owner, name, clonePath } | null`.
    - `getTour(workspaceId, repoId)` → `Tour | null`. Parse `onboarding.json` with `Tour.safeParse`; an invalid row → `null` + reason for the caller to log.
    - `saveTour(repoId, tour)`: upsert on `repo_id`, `generated_at = tour.generated_at`.
    - `setLastAttempt(repoId, lastAttempt)`: read-modify-write of the stored json in one statement or a service-owned transaction (implementer chooses; document it).
    - Every read joins `repos` on `workspace_id`.
  - **Package / Type:** server — backend (driven adapter)
  - **Executor:** implementer
  - **Skills to use:** onion-architecture, drizzle-orm-patterns, postgresql-table-design
  - **Owned paths:** `server/src/modules/onboarding/repository.ts`, `server/test/onboarding-repository.it.test.ts`
  - **Depends-on:** T1
  - **Risk:** low
  - **Checkpoint:** no (server)
  - **Known gotchas:** DB tests must be `*.it.test.ts` (`server/AGENTS.md`); no schema change, so don't run `pnpm db:generate`.
  - **Acceptance:** `onboarding-repository.it.test.ts`:
    - save → get round-trips every `Tour` field incl. `usage` and `last_attempt` (AC-26 storage).
    - A repo of another workspace → `getRepoForWorkspace`/`getTour` return null (AC-37 at data level).
    - A stored json missing `last_attempt` parses.
    - `pnpm exec vitest run test/onboarding-repository.it.test.ts` (Docker) and `pnpm typecheck` pass.

- **T8** — Client API methods + hooks (covers AC-4, AC-24, AC-25)
  - **Action:** In `lib/api.ts` add `getOnboardingTour(repoId)` → `OnboardingTourResponse` and `generateOnboardingTour(repoId)` → `Tour` (types via `import type`). New `lib/hooks/onboarding.ts`:
    - `useOnboardingTour(repoId)`: TanStack Query key `["onboarding-tour", repoId]`; `refetchInterval: 2000` while `data.status === "generating"`, else off.
    - `useGenerateOnboardingTour(repoId)`: mutation. On success it sets the query data to `{status:"ready", tour, index_sha}` (keep the previous `index_sha`) and invalidates. On `ApiError` 409 `generation_in_progress` it invalidates (so the polling picks up the other tab's result) and surfaces the error.
  - **Package / Type:** client — ui (data layer)
  - **Executor:** implementer
  - **Skills to use:** frontend-architecture, react-best-practices, react-testing-library
  - **Owned paths:** `client/src/lib/api.ts`, `client/src/lib/hooks/onboarding.ts`, `client/src/lib/hooks/onboarding.test.tsx`
  - **Depends-on:** T1
  - **Risk:** low
  - **Checkpoint:** no (client)
  - **Known gotchas:** `import type` only from `@devdigest/shared` (`client/INSIGHTS.md:125`); precedent hook tests `client/src/lib/hooks/context.test.tsx`.
  - **Acceptance:** `onboarding.test.tsx`:
    - `GET` is called on mount and **no** `POST` is made by the query hook (AC-4 client side).
    - The mutation posts to `/repos/r1/onboarding/generate` and updates the cache.
    - A 409 `generation_in_progress` triggers a refetch.
    - Polling runs while `generating` and stops on `ready`.
    - `pnpm exec vitest run src/lib/hooks/onboarding.test.tsx && pnpm typecheck` pass.

- **T9** — Section cards, inert markdown, Mermaid fallback, GitHub tree URL (covers AC-3 [toggle], AC-13 [note], AC-14, AC-16 [display], AC-17 [0-task message], AC-18, AC-21, AC-33 [render], AC-34, AC-35, NFR a11y/i18n)
  - **Action:** Build `TourSections` and its children (Design → Client placement):
    - `SectionCard`: `<section id>`, heading `tabIndex={-1}`, toggle `<button aria-expanded aria-controls>`, starts expanded.
    - `TourMarkdown`: `react-markdown` + `remark-gfm`, no `rehype-raw`, `skipHtml`, `components.a` renders a `<span>` (no anchor).
    - `ArchitectureCard`: summary or, for a skeleton, stack + structure only; diagram via `MermaidDiagram` with the new fallback note (AC-18); routes list.
    - `CriticalPathsCard`, `ReadingPathCard`: path, reason (model text, else computed), computed reason as a dim suffix, Open link. The reading-path note is shown when `index.hotness_available === false` (AC-13).
    - `RunLocallyCard`: command rows with an icon-only copy button (`aria-label` naming the command), `navigator.clipboard.writeText` + `useToast`, the review-before-running notice, and the empty line "No run instructions found in the repo's files".
    - `FirstTasksCard`: title, path + Open, complexity badge **with text**; 0 tasks or skeleton → "first tasks need the LLM step" message.
    - `OpenOnGitHubLink`: blob URL for a file, tree URL for a dir, at `tour.source_sha`, `target="_blank" rel="noopener noreferrer"`.
    - Add `githubTreeUrl(repoFullName, sha, dir)` to `lib/github-urls.ts`.
    - Add an optional `fallback?: React.ReactNode` prop to `MermaidDiagram` (rendered instead of `null` when invalid; default unchanged).
    - Write the section/card keys of `client/messages/en/onboarding.json`. **Replace** the outdated keys; the file becomes `{ "page": {…}, "sections": {…} }`, and T11 adds `page.*` keys.
  - **Package / Type:** client — ui
  - **Executor:** implementer
  - **Skills to use:** frontend-architecture, react-best-practices, react-testing-library, security, next-best-practices
  - **Owned paths:** `client/src/app/repos/[repoId]/onboarding/_components/TourSections/**`, `client/src/components/mermaid-diagram/MermaidDiagram.tsx`, `client/src/components/mermaid-diagram/MermaidDiagram.test.tsx` (new), `client/src/lib/github-urls.ts`, `client/src/lib/github-urls.test.ts` (new or existing — to verify), `client/messages/en/onboarding.json`
  - **Depends-on:** T1
  - **Risk:** medium (XSS surface)
  - **Checkpoint:** yes (client)
  - **Known gotchas:** `fireEvent`, not `userEvent` (`client/INSIGHTS.md:85`); `@devdigest/ui` only in `'use client'` files (`client/INSIGHTS.md:56`); `import type` from shared (`client/INSIGHTS.md:125`); `MermaidDiagram` has no other consumer (`frontend-architecture` accepted exceptions), so the prop change is safe.
  - **Acceptance:** `TourSections.test.tsx`:
    - Toggling a card flips `aria-expanded` and hides the body (AC-3).
    - A summary with `<script>` and `[x](javascript:alert(1))` renders no `script` element and no `link` role (AC-33).
    - Open `href`/`target`/`rel` for a file (blob) and a dir (tree) at `source_sha` (AC-34).
    - Copy button calls a mocked `navigator.clipboard.writeText` with the exact command, a toast appears, the notice is rendered (AC-35).
    - The hotness note appears when `hotness_available: false` (AC-13).
    - Skeleton fixture: no prose, rows show "imported by N files · rank pNN", first-tasks message and no task cards (AC-21).
    - Complexity badge has a text label.
  - `MermaidDiagram.test.tsx`: `chart="not a diagram"` + `fallback` → the fallback is shown (AC-18).
  - `github-urls` tree case.
  - Full client `pnpm test` + `pnpm typecheck` pass (checkpoint).

### Phase 3 — Facade and page (wave 3)

- **T10** — Repo-intel facade: `collectTourFacts` + `classifyPaths` (covers AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-17, AC-19, AC-31, NFR Performance)
  - **Action:** Add to the `RepoIntel` interface and `RepoIntelService`:
    - `collectTourFacts(repoId)`: no LLM. Steps:
      1. Repo basics + index state.
      2. `usable` / `unusable_reason`: no state row → `no_data`; `failed`; `degraded`; `!config.repoIntelEnabled` → `flag_off`; zero `file_rank` rows → `no_ranked_files`.
      3. `source_sha = lastIndexedSha || snapshot.headSha`.
      4. `listFiles` at sha; read manifests/README via `readText` (README candidates `README.md`, `readme.md`, `README` at root).
      5. Churn since `commitDate(sha) − 180 days` (D2).
      6. Rank rows (pagerank, percentile), inbound edge counts, endpoint facts, chains (reuse the `getCriticalPaths` walk with junk-filtered seeds).
      7. Call T5 builders.
      8. Return `TourFacts` with `index.files_total` = `stats.totalCandidates ?? null` and `bounded = (stats.bounded ?? 0) > 0`.
    - `classifyPaths(repoId, sha, paths)` → `Record<path, 'file'|'dir'|'missing'>` from `listFiles`.
    - New repository reads: `getAllRankRows(repoId)` (path, pagerank, percentile), `getInboundCounts(repoId)`, `getAllEndpointFacts(repoId)`, `getIndexStats(repoId)`.
    - Replace the local `JUNK_PATH_PATTERNS`/`isJunkPath` in `service.ts` with an import from `junk-paths.ts` (conventions sampling now excludes root-level `test/` too — note it in the commit body).
    - Update `repo-intel/README.md`'s "PageRank + git hotness" claim to the actual behaviour.
  - **Package / Type:** server — backend (application facade + repository)
  - **Executor:** implementer
  - **Skills to use:** onion-architecture, drizzle-orm-patterns, typescript-expert, security
  - **Owned paths:** `server/src/modules/repo-intel/service.ts`, `server/src/modules/repo-intel/types.ts`, `server/src/modules/repo-intel/repository.ts`, `server/src/modules/repo-intel/README.md`, `server/test/repo-intel-tour-facts.it.test.ts`
  - **Depends-on:** T1, T3, T5
  - **Risk:** high (central read; perf budget; touches a module many features use)
  - **Checkpoint:** yes (server)
  - **Known gotchas:** `getTopFilesByRank` returns `[]` when the flag is off (`service.ts:690`), so flag-off must be detected explicitly; `tryGetIndexState` swallows DB errors into `null` (`repository.ts:236-240`); the onion D9 deviation (pipeline imports concrete adapters) must not be copied, so use `container.repoSnapshot`; ripple: grep `RepoIntel` consumers incl. tests before changing the interface (fakes use `as unknown as RepoIntel`, so new methods are safe).
  - **Acceptance:** `repo-intel-tour-facts.it.test.ts` (real Postgres + a temp git fixture clone):
    - AC-7: collect twice → `toEqual`, and a counting fake `LLMProvider` injected via overrides records 0 calls.
    - AC-13: a depth-1 clone → `hotness_available: false`, reading-path order = pagerank order.
    - AC-19: each of the five unusable cases → `usable: false` with the right `unusable_reason`.
    - AC-31: a partial/bounded index → `files_total`/`bounded` set.
    - `classifyPaths` returns file/dir/missing.
    - NFR: a generated 5,000-file fixture index collects in ≤ 3,000 ms (timing assertion with a 2× slack env override documented in the test).
    - Existing `conventions-*.it`, `blast*`, `repo-intel-*` tests green.
    - Full server suite `pnpm test` (Docker) + `pnpm typecheck` pass (checkpoint).

- **T11** — Onboarding Tour page and view (covers AC-1 [breadcrumb], AC-2, AC-3 [nav list, fragment, focus, post-load scroll], AC-4, AC-5, AC-6, AC-22, AC-23 [notice], AC-24 [disabled + progress], AC-25, AC-27, AC-30, AC-31, AC-36, NFR a11y/i18n)
  - **Action:**
    - `page.tsx`: thin server component with `generateMetadata` from `onboarding.page.title`.
    - `OnboardingTourView` (`'use client'`):
      - `AppShell crumb=[repo full_name, t("page.title")]`; `useRepoNotFound`.
      - States: loading `Skeleton`; error `ErrorState` + retry; `not_cloned` state with Generate disabled; `none` empty state with *Generate tour* + "makes one LLM call" text; `generating` progress with `role="status"`/`aria-live="polite"` and buttons disabled.
      - Header: title "Onboarding for `<name>`", subtitle "Generated from index of N files · generated X ago", or "N of M files" + coverage note when bounded/partial (D6).
      - `TourUsageBadge` (AC-27 / D3, tooltip = model).
      - Actions *Regenerate* (tooltip "makes one LLM call", no confirm) and *Share link* (copies `window.location.origin + pathname + hash`, toast, no API call).
      - `TourBanners`: skeleton reason banner with Regenerate; partial-index notice with skipped count; last-attempt-failed notice with time and reason; stale notice when `index_sha && index_sha !== tour.source_sha`.
      - `TourToc` (`<nav aria-label>` with 5 links): click → `scrollIntoView`, focus the heading, `history.replaceState` to `#id`.
      - Effect after data loads: if `location.hash` matches a section id, scroll + focus.
    - Pure helpers in `helpers.ts`: `usageLabel`, `subtitleParts`, `isStale`, `bannerFor`.
    - Add the `page.*` keys to `onboarding.json`.
  - **Package / Type:** client — ui
  - **Executor:** implementer
  - **Skills to use:** frontend-architecture, react-best-practices, next-best-practices, react-testing-library
  - **Owned paths:** `client/src/app/repos/[repoId]/onboarding/page.tsx`, `client/src/app/repos/[repoId]/onboarding/_components/OnboardingTourView/**`, `client/messages/en/onboarding.json`
  - **Depends-on:** T4, T8, T9
  - **Risk:** medium
  - **Checkpoint:** yes (client)
  - **Known gotchas:** thin page, no `@devdigest/ui` in `page.tsx` (`client/INSIGHTS.md:56`); `fireEvent` (`client/INSIGHTS.md:85`); a webpack-only failure class means this task's acceptance includes `pnpm build` (with no `next dev` running, `client/INSIGHTS.md:135`) or the T13 e2e flow.
  - **Acceptance:** `OnboardingTourView.test.tsx` (hooks mocked at `@/lib/hooks/onboarding`, the precedent in `ProjectContextView.test.tsx`):
    - AC-2: tour fixture → 5 cards in order, 5 nav links, subtitle, both actions.
    - AC-1: breadcrumb `acme/app › Onboarding Tour`.
    - AC-3: clicking a nav link sets `location.hash`, focuses the heading.
    - AC-4: `none` → CTA + one-call text, no mutation call on mount.
    - AC-5: loading and error + retry.
    - AC-6: `not_cloned` → Generate disabled.
    - AC-22: 3 skeleton banners + partial notice.
    - AC-23: last-attempt notice.
    - AC-24: `generating` → buttons disabled, status region.
    - AC-25: Regenerate → mutation called, no confirm dialog, tooltip text.
    - AC-27: `{1, 8000, 1119, 0.0012}` → "1 LLM call · 9,119 tok · $0.0012"; `cost_usd:null` → "—".
    - AC-30: stale shown/hidden.
    - AC-31: `5000/12450` → "N of M" + coverage note.
    - AC-36: clipboard gets `<origin>/repos/<id>/onboarding#reading-path`, and the `fetch`/api spy records no request.
    - `helpers.test.ts` for the pure helpers.
    - Full client `pnpm test`, `pnpm typecheck`, and `pnpm build` pass (checkpoint).

### Phase 4 — Server module (wave 4)

- **T12** — Onboarding service, routes, registration (covers AC-4, AC-6, AC-15, AC-16, AC-17, AC-19, AC-20, AC-23, AC-24, AC-25, AC-26, AC-28, AC-30, AC-37)
  - **Action:**
    - Add `ConflictError` (409, `code` param) to `platform/errors.ts`.
    - `OnboardingService` with narrow deps (Design → Placement):
      - `get(workspaceId, repoId)` → `OnboardingTourResponse`: status precedence `generating` > `not_cloned` > `ready` > `none`; `index_sha` from `facts`-free `getIndexState` (exposed as a dep `indexSha(repoId)`); **never** touches `llm`.
      - `generate(workspaceId, repoId, correlationId)`, steps in order:
        1. 404 when the repo is not in the workspace.
        2. 409 `not_cloned`.
        3. 409 `generation_in_progress` if `inflight.has(repoId)`; check-and-set inflight in one synchronous block after the 404/`not_cloned` checks (no `await` between check and set), one `try/finally` after the set.
        4. `facts`.
        5. Skeleton `index_degraded` if `!usable` (no `llm`/`resolveModel` call).
        6. `resolveModel(workspaceId,'onboarding')` then `llm(provider)`; `ConfigError` → skeleton `llm_unavailable`.
        7. Build the prompt, then `log.info(prompt.assembled {call:'onboarding', model, correlation_id, sections, total_chars, est_tokens})`.
        8. `withTimeout(llm.completeStructured({ model, schema, schemaName:'onboarding_tour', messages, singleAttempt:true, maxRetries:0, timeoutMs: LLM_TIMEOUT_MS, sessionId }), LLM_TIMEOUT_MS)`.
        9. Success → `classifyPaths` + `mergeModelOutput` → `mode: llm`. Any throw → skeleton `llm_failed`, `detail = redactDetail(err)`, usage from `err.usage` (D1) else 0/0/null, `llm_calls: 1`.
        10. Persist: if the result is a skeleton and a stored `mode: llm` tour exists → `setLastAttempt` and return the stored tour + `last_attempt` (AC-23); else `saveTour` (a successful `llm` tour resets `last_attempt` to null).
        11. One `log.info(formatGeneratedLog(...))`.
        12. `finally` delete inflight.
    - `routes.ts`: `GET /repos/:repoId/onboarding` and `POST /repos/:repoId/onboarding/generate`. Zod params and response schemas from shared; thin handlers (`getContext` → one service call). The service is built once per plugin.
    - Register in `modules/index.ts`.
  - **Package / Type:** server — backend
  - **Executor:** implementer
  - **Skills to use:** onion-architecture, fastify-best-practices, zod, security, typescript-expert
  - **Owned paths:** `server/src/modules/onboarding/service.ts`, `server/src/modules/onboarding/routes.ts`, `server/src/modules/index.ts`, `server/src/platform/errors.ts`, `server/test/onboarding-service.test.ts`, `server/test/onboarding.it.test.ts`, `server/test/routes-smoke.test.ts` (only if it enumerates routes — to verify)
  - **Depends-on:** T2, T6, T7, T10
  - **Risk:** high (call-count guarantee, concurrency, persistence semantics)
  - **Checkpoint:** yes (server)
  - **Known gotchas:**
    - Inject fail-fast fakes for **every** provider (`openai`, `anthropic`, `openrouter`) in tests so no real paid call happens on a machine with a key (`server/INSIGHTS.md:229-245`); check `~/.devdigest/secrets.json` before trusting a hermetic run.
    - `AppError` subclasses report `name: 'AppError'`, so assert on `code`/`statusCode`, not `name` (`server/INSIGHTS.md:378`).
    - OpenRouter ignores `timeoutMs`, so keep the `withTimeout` race (`intent/service.ts:96-103`).
    - Unhandled rejections crash the process (`server/INSIGHTS.md:349`); `generate` runs in the request (no job), so this does not apply. Don't move it to `jobs.enqueue` without a handler.
  - **Acceptance:**
    - `onboarding-service.test.ts` (narrow-deps fakes, counting `LLMProvider`, captured logger):
      - AC-15: ok → exactly 1 call; schema-invalid fake → 1 call + `llm_failed`; throwing fake → 1 call, no retry.
      - AC-19: 5 index cases → 0 calls, `index_degraded`, index status/reason in the tour.
      - AC-20: no key (`ConfigError`) → 0 calls `llm_unavailable`; detail contains no key.
      - AC-23: stored full tour + failing regenerate → sections unchanged, `last_attempt.usage.llm_calls === 1`.
      - AC-24: two concurrent `generate` → 1 LLM call, the second rejects with 409 `generation_in_progress`.
      - AC-28: `llm` run → exactly one `onboarding: generated` line with `llm_calls=1` and one `prompt.assembled` event; skeleton-by-index → the line with `llm_calls=0` and no `prompt.assembled`; neither log payload contains the README text.
      - AC-4: `get` → 0 LLM calls.
    - `onboarding.it.test.ts` (app.inject + Postgres):
      - AC-37: repo of another workspace → `GET` 404 and `POST` 404, 0 calls.
      - AC-6: `clone_path` null → `POST` 409 `not_cloned`, 0 calls; `GET` → `not_cloned`.
      - AC-26: read the stored tour after an `llm`, a skeleton-by-index and a skeleton-by-failure generation and check every usage field (`cost_usd` 0 when no call, `model` null when no call).
      - AC-30: `GET` returns `index_sha`.
    - Onion grep checklist (`onion-architecture` §9) prints nothing for `modules/onboarding`.
    - Full server `pnpm test` + `pnpm typecheck` pass (checkpoint).

### Phase 5 — Browser flow and validation (waves 5–6)

- **T13** — e2e flow `13-onboarding-tour` (covers AC-1, AC-4 or AC-6, AC-2/AC-21 when a clone exists)
  - **Action:** Write `e2e/specs/13-onboarding-tour.flow.json`, following `e2e/docs/writing-flows.md`:
    1. Open `/onboarding` and assert the Add-repository screen is unchanged (flow 06 untouched).
    2. Navigate to a seeded repo's Onboarding Tour via the sidebar.
    3. Assert the heading/breadcrumb and one deterministic state: `not_cloned` for the `clonePath: null` seed, or empty state + click *Generate tour*. The e2e stack does NOT guarantee the absence of an LLM key (review F3), so flow 13 never clicks Generate; it asserts only the `not_cloned` state.
    - Assert text, not landmark roles (`e2e/INSIGHTS.md`, commit `a8756e8`).
  - **Package / Type:** e2e
  - **Executor:** implementer (writes the flow); **parent** runs it in T14
  - **Skills to use:** react-testing-library (query-by-text discipline), next-best-practices
  - **Owned paths:** `e2e/specs/13-onboarding-tour.flow.json`
  - **Depends-on:** T11, T12
  - **Risk:** medium (seed/clone availability in the e2e stack — to verify)
  - **Checkpoint:** n/a (single e2e task)
  - **Known gotchas:** CI Chrome differs on role lookups, so assert text (`e2e/INSIGHTS.md`, recent commits `ddc72d6`, `a8756e8`).
  - **Acceptance:** `./scripts/e2e.sh` passes all flows incl. `06-onboarding` (unchanged) and `13-onboarding-tour`.

- **T14** — Validation, manual demo, insights, Delivery log (covers AC-29, NFR Performance/Cost [demo evidence], all ACs [verification])
  - **Action:**
    - Run every verify command (Testing strategy), `./scripts/e2e.sh`, and the onion grep checklist.
    - Run the AC-29 demo on an unfamiliar public JS/TS repo (add → index → generate). Record the repo name, the `onboarding: generated` log line, a screenshot and `duration_ms`; check log cost = badge cost per D5.
    - Apply `engineering-insights`; append the spec's Delivery log (parent only; the spec is otherwise read-only).
    - Run `/pr-self-review` before any push.
  - **Package / Type:** all
  - **Executor:** parent
  - **Skills to use:** engineering-insights, pr-self-review
  - **Owned paths:** `specs/2026-10-01-onboarding-tour.md` (Delivery log section only), `specs/2026-10-01-onboarding-tour.plan.md` (Delivery log section only), `server/INSIGHTS.md`, `client/INSIGHTS.md`, `e2e/INSIGHTS.md`, `INSIGHTS.md`
  - **Depends-on:** T13
  - **Risk:** low
  - **Acceptance:** all commands green; the AC-29 evidence (repo, log excerpt with `llm_calls=1`, badge screenshot, cost match) is in the Delivery log.

## AC → task coverage
Use this to build the AC → task → test → commit matrix. "Test" names the test file each task adds (`S:` = `server/test/`, `C:` = client, next to the code).

| AC | Implementing task(s) | Test task / file |
|---|---|---|
| AC-1 | T4, T11, T13 | T4 `C: nav.test.ts`, `app-shell/helpers.test.ts`; T11 view test (breadcrumb); T13 flow 13 + flow 06 |
| AC-2 | T1, T11 | T11 `OnboardingTourView.test.tsx` |
| AC-3 | T9, T11 | T9 `TourSections.test.tsx` (toggle); T11 view test (nav, fragment, focus) |
| AC-4 | T8, T11, T12 | T8 `hooks/onboarding.test.tsx`; T11 view test; T12 `S: onboarding-service.test.ts` (get → 0 calls) |
| AC-5 | T11 | T11 view test |
| AC-6 | T11, T12 | T11 view test; T12 `S: onboarding.it.test.ts` |
| AC-7 | T3, T5, T10 | T10 `S: repo-intel-tour-facts.it.test.ts` |
| AC-8 | T3, T5, T10 | T5 `S: repo-intel-tour-facts.test.ts` |
| AC-9 | T5, T10 | T5 unit test |
| AC-10 | T5, T10 | T5 unit test |
| AC-11 | T3, T5, T10 | T5 unit test |
| AC-12 | T3, T5, T10 | T5 unit test; T5 `repo-intel-junk-paths.test.ts` |
| AC-13 | T1, T3, T5, T9, T10 | T3 `S: repo-snapshot.test.ts` (depth-1); T10 `.it`; T9 card test |
| AC-14 | T5, T9, T10 | T5 unit test; T9 card test |
| AC-15 | T2, T12 | T2 reviewer-core + `S: llm-single-attempt.test.ts`; T12 service test |
| AC-16 | T6, T9, T12 | T6 `S: onboarding-helpers.test.ts` (merge) |
| AC-17 | T3, T6, T9, T10, T12 | T6 helpers test; T10 `.it` (`classifyPaths`) |
| AC-18 | T9 | T9 `MermaidDiagram.test.tsx` |
| AC-19 | T6, T10, T12 | T10 `.it` (five cases); T12 service test |
| AC-20 | T2, T6, T12 | T2 tests (usage on error); T12 service test |
| AC-21 | T5, T6, T9 | T6 helpers test (skeleton fixture); T9 card test |
| AC-22 | T11 | T11 view test |
| AC-23 | T1, T7, T11, T12 | T7 repo `.it`; T12 service test; T11 view test |
| AC-24 | T8, T11, T12 | T12 service test (concurrency); T8 hook test; T11 view test |
| AC-25 | T8, T11, T12 | T11 view test; T8 hook test |
| AC-26 | T1, T2, T7, T12 | T12 `S: onboarding.it.test.ts`; T7 repo `.it` |
| AC-27 | T11 | T11 view test |
| AC-28 | T6, T12 | T6 helpers test (format); T12 service test (one line, one event) |
| AC-29 | T14 | manual demo, Delivery log |
| AC-30 | T1, T11, T12 | T11 view test; T12 `.it` (`index_sha`) |
| AC-31 | T1, T10, T11 | T10 `.it`; T11 view test |
| AC-32 | T6 | T6 `S: onboarding-prompt.test.ts` |
| AC-33 | T6, T9 | T6 prompt test; T9 card test |
| AC-34 | T9 | T9 card test + `github-urls` test |
| AC-35 | T5, T9 | T9 card test; T5 (no script bodies) |
| AC-36 | T11 | T11 view test |
| AC-37 | T7, T12 | T7 repo `.it`; T12 `.it` |
| NFR Performance | T10, T14 | T10 timed `.it`; T14 demo `duration_ms` |
| NFR Security | T3, T6, T12 | T3 symlink test; T6 redaction test |
| NFR a11y / i18n | T9, T11 | role/name queries in T9/T11 tests; `pr-self-review` i18n gate |

Task → AC trace: every task above names its ACs; there are no tasks without an AC.

## Execution order
Execution waves (multi-agent). Disjoint `Owned paths` inside each wave are checked: no file appears in two tasks of the same wave. `client/messages/en/onboarding.json` is owned by T9 (wave 2) and then T11 (wave 3), one after the other.

| Wave | Tasks (parallel) | Checkpoint per package | Waits for |
|---|---|---|---|
| 1 | T1, T2, T3, T4 | server: **T3** · client: **T1** · reviewer-core: T2 (only task, full suite) | — |
| 2 | T5, T6, T7, T8, T9 | server: **T6** · client: **T9** | wave 1 |
| 3 | T10, T11 | server: **T10** · client: **T11** | T10 ← T1, T3, T5; T11 ← T4, T8, T9 |
| 4 | T12 | server: **T12** | T2, T6, T7, T10 |
| 5 | T13 | e2e: T13 (flow written; run by parent) | T11, T12 |
| 6 | T14 (parent) | — | T13 |

DAG: `T1 → {T5, T6, T7, T8, T9}`, `T3 → T10`, `T5 → T10`, `{T2, T6, T7, T10} → T12`, `{T4, T8, T9} → T11`, `{T11, T12} → T13 → T14`. No cycles.

The parent passes the wave's checkpoint result (one line per package, e.g. `server unit: 412 passed · typecheck ok`) to every task of the next wave as its baseline instead of letting each one re-run it.

### Commit slicing (one commit per slice, on `lesson-05`, conventional messages, each ending with the attribution line)
| # | Slice | Tasks | Suggested message |
|---|---|---|---|
| 1 | shared contract | T1 | `feat(shared): Tour contract for the onboarding tour; drop unused Onboarding schema` |
| 2 | single-attempt LLM | T2 | `feat(llm): singleAttempt structured calls (no reprompt, no transport retry)` |
| 3 | repo snapshot port | T3 | `feat(server): RepoSnapshot port over git blobs (tree, manifests, churn)` |
| 4 | sidebar | T4 | `feat(client): Onboarding Tour sidebar item; /onboarding no longer highlights it` (body: sanctioned `vendor/ui/nav.ts` edit) |
| 5 | tour facts | T5 | `feat(repo-intel): pure onboarding fact builders; junk paths match at the root` |
| 6 | onboarding domain | T6 | `feat(onboarding): prompt, output schema, grounding/merge and skeleton helpers` |
| 7 | onboarding repository | T7 | `feat(onboarding): tour repository over the existing onboarding table` |
| 8 | client data layer | T8 | `feat(client): onboarding tour api + hooks` |
| 9 | section cards | T9 | `feat(client): onboarding tour section cards, inert markdown, mermaid fallback` |
| 10 | facade | T10 | `feat(repo-intel): collectTourFacts + classifyPaths facade reads` |
| 11 | page | T11 | `feat(client): Onboarding Tour page` |
| 12 | module | T12 | `feat(onboarding): generate/read endpoints with one LLM call and honest skeleton` |
| 13 | e2e | T13 | `test(e2e): onboarding tour flow` |
| 14 | insights / delivery log | T14 | `docs(insights): …` and `docs(specs): onboarding tour delivery log` |

## Testing strategy
- **server** (`cd server`):
  - Targeted, per non-checkpoint task: `pnpm exec vitest run test/<own files>` + `pnpm typecheck`.
  - Checkpoint: unit `pnpm exec vitest run --exclude '**/*.it.test.ts'`; with Docker `pnpm test`; `pnpm typecheck`.
  - New tests:
    - `onboarding-contracts.test.ts`, `llm-single-attempt.test.ts`, `repo-snapshot.test.ts`.
    - `repo-intel-tour-facts.test.ts`, `repo-intel-junk-paths.test.ts`.
    - `onboarding-helpers.test.ts`, `onboarding-prompt.test.ts`.
    - `onboarding-repository.it.test.ts`, `repo-intel-tour-facts.it.test.ts`, `onboarding-service.test.ts`, `onboarding.it.test.ts`.
- **reviewer-core** (`cd reviewer-core`): `npm test` + `npm run build` (T2 runs both; it is the package's only task).
- **client** (`cd client`):
  - Targeted: `pnpm exec vitest run <own files>` + `pnpm typecheck`.
  - Checkpoint: `pnpm test` + `pnpm typecheck`; T11 also runs `pnpm build`, with no `next dev` running (`client/INSIGHTS.md:135`).
- **e2e** (validation phase, parent): `./scripts/e2e.sh` from the repo root.
- **Manual** (validation phase, parent): the AC-29 demo and the NFR Performance timing from the demo log.
- **Multi-agent note:** only the wave's `Checkpoint: yes` task per package runs the full suite. Every other task runs its own targeted test files plus typecheck, so the parent should not expect a full-suite result from a non-checkpoint task.

## Risks & traps
- **Project Context tech debt repeated by copy-paste** (TD-1 fs call in a route, TD-4 skipped-dirs literal, TD-2 large view, TD-3 unused hooks) → each has a grep/`wc -l` acceptance line in T3/T5/T8/T11/T12 (see *Tech debt from Project Context*).
- **Real paid LLM calls from tests** on a machine with `OPENROUTER_API_KEY` → inject fail-fast fakes for all three providers in every onboarding test — `server/INSIGHTS.md:229-245`.
- **Changing provider defaults** while adding `singleAttempt` would alter every review → T2 keeps the flag-off path byte-for-byte and relies on the existing provider tests — `reviewer-core/src/llm/openrouter.ts:60-123`.
- **Junk-path fix changes conventions sampling** (root `test/`, `tests/`, `migrations/` now excluded) → called out in the T10 commit body; conventions `.it` tests run in the T10 checkpoint — `server/src/modules/conventions/service.ts:95`.
- **AC-14 interpretation** (junk filter on seeds and chain members) may differ from the spec author's intent → flagged for cross-review — `server/src/modules/repo-intel/service.ts:709-748`.
- **`files_total` may be missing after an incremental refresh** → D6 fallback; T10 verifies what `runIncremental` writes to `stats` — `server/src/modules/repo-intel/pipeline/full.ts:254-276`.
- **In-memory in-flight lock** works only in one process (the local-first server is one process) → documented in `service.ts`; a multi-instance deployment would need a DB lock (out of scope).
- **Timed perf `.it` test can be flaky on CI** → generous slack via env override, still asserting the 3 s budget locally — NFR Performance.
- **Webpack-only client failures** (runtime import from the shared barrel) → `import type` only; T11 `pnpm build`; T13 e2e — `client/INSIGHTS.md:125-134`.
- **Legacy `onboarding.json` i18n strings and `onboarding.system.md`** describe a different tour → both fully replaced (T9/T11, T6) — `client/messages/en/onboarding.json`, `server/src/prompts/onboarding.system.md:1`.
- **Mermaid model output** can carry `click`/HTML → `securityLevel: "strict"` already set (`MermaidDiagram.tsx:37`); no change to that.
- **git on untrusted repos**: no shell, `--` before paths, refs validated, symlink blobs blocked, output caps — T3.

## Tech debt from Project Context (spec → *Tech debt carried from Project Context*)
The spec added TD-1..TD-6 after the plan was first written. They are not ACs; the plan handles them as follows (the task cards carry the matching acceptance lines).

| TD | Handling | Task |
|---|---|---|
| TD-1 clone check via fs in a route | **Already fixed upstream** (`ProjectDocs.exists`, `adapters/project-docs/index.ts:34`). The onboarding service takes `cloneExists` as a narrow dep wired from `container.projectDocs.exists`; no `fs` import in `modules/onboarding`. Grep in T12 acceptance. | T12 |
| TD-2 oversized view | **Avoid.** `OnboardingTourView.tsx` ≤ 200 lines; logic in a hook file, rows as sub-components. `wc -l` in T11 acceptance. | T11 |
| TD-3 unused hooks/keys | **Avoid.** T8 exports only what T11 uses; every export grepped for a consumer after T11. | T8, T11 |
| TD-4 duplicated skipped-dirs literal | **Avoid another copy.** No new file: `buildStructure` imports the existing `EXCLUDED_DIRS` (`repo-intel/constants.ts:17-26`). Re-pointing the other literals (`adapters/project-docs/fs.ts:8`, `project-context/service.ts:84`, `codeindex/ripgrep.ts:26`) is not done here — follow-up. | T5 |
| TD-5 local-only edits lost on clone sync | **Not fixed.** No task; the tour's stale notice (AC-30) already covers a re-synced clone. | — |
| TD-6 CI/GitHub runner out of scope | **Not fixed.** The tour is studio-only; nothing to build. | — |

Effects on the DAG: none (after review F9/F13 neither `_shared/skipped-dirs.ts` nor `RepoSnapshot.cloneExists` exists; T12 wires `container.projectDocs.exists`).

## Cross-model review amendments (2026-10-01, reviewer: opus; verdict APPROVE WITH CHANGES)
Applied to the task cards and, where the phase text above differs, **this section wins**.

| F | Sev | Amendment | Task |
|---|---|---|---|
| F1 | HIGH | `singleAttempt` also passes per-request `{maxRetries: 0, timeout}` in all three providers (SDKs retry twice by default); optional injected `fetch`; a 500/429 test per provider asserts exactly 1 call | T2 |
| F2 | HIGH | `server/test/contracts.test.ts:14,169-183` parses the removed `Onboarding`; T1 owns that file and removes the case | T1 |
| F3 | HIGH | Flow 13 never clicks Generate; only nav, breadcrumb and `not_cloned` | T13 |
| F4 | MED | N = real `file_rank` count; M only from `stats.totalCandidates`; else "coverage unknown" (D6 revised) | T10, T11 |
| F5 | MED | churn: `-z`, `core.quotePath=false`, exclude shallow-boundary commits; depth-2 test | T3 |
| F6 | MED | explicit `maxBuffer`/stream for `ls-tree`; `truncated: true`, never empty | T3 |
| F7 | MED | `lastIndexedSha` missing in clone → `sha_missing` → `index_degraded` | T1, T10 |
| F8 | MED | no YAML dependency: bounded hand-rolled line parsers; data stores also matched by `image:` (D4) | T5 |
| F9 | MED | reuse `EXCLUDED_DIRS`/`HOTNESS_WINDOW_DAYS`; no new skipped-dirs file (TD-4 corrected) | T5 |
| F10 | MED | hotness max over the reading-path candidate set | T5 |
| F11 | MED | the 90 s limit is a per-request `timeout`/abort, `withTimeout` is only a backstop | T2, T12 |
| F12 | LOW | check-and-set of inflight in one synchronous block | T12 |
| F13 | LOW | TD-1 already fixed upstream; drop `RepoSnapshot.cloneExists`, wire `container.projectDocs.exists` | T3, T12 |
| F14 | LOW | `formatTokensTotal(0,0)` = `"0 tok"`; UI special-cases 0 calls | T11 |
| F15 | LOW | `MermaidDiagram` is also used by `BlastGraph`; its tests join T9 acceptance | T9 |
| F16 | LOW | test path `reviewer-core/test/openrouter.test.ts` | T2 |
| F17 | LOW | nav icon `Workflow`/`ListChecks` | T4 |
| F18 | LOW | a wave's checkpoint task runs after its sibling tasks land (parent triggers it last) | all |
| F19 | LOW | chain building skips junk at each hop | T5 |
| F20 | LOW | `lastIndexedSha === ''` → `index_sha: null` | T10 |

Reviewer's D1–D6 verdict: D1, D2 (+F5), D3 (+F14), D5 accepted; D4 accepted with the `image:` match; D6 replaced (F4); AC-14 interpretation accepted (+F19).

## Open decisions
All are non-blocking; the tasks already use the default.
- **D1:** Which usage is recorded for a failed single call (schema-invalid output)? — recommended default: providers attach the spent usage (`tokensIn/tokensOut/costUsd`) to the error they throw in single-attempt mode, and the service records it. A transport error or timeout records `0/0` and `cost_usd: null` (nothing reliable to report). — used by: T2, T12.
- **D2:** What anchors AC-12's "last 180 days"? — recommended default: the committer date of `source_sha`, so AC-7's identical-facts promise holds on any day; with a single-commit history, `hotness_available: false`. — used by: T3, T5, T10. (Spec text should be tightened: Recommendation, `requirement`.)
- **D3:** How the usage badge renders a tour with `llm_calls: 0`. — recommended default: "0 LLM calls", with tokens and cost omitted and the tooltip "No LLM call was made". AC-27's format applies when `llm_calls === 1`. — used by: T11.
- **D4:** AC-11 details. — recommended default: a compose service counts as a data store when its name equals or starts with one of `postgres`, `postgresql`, `mysql`, `mariadb`, `mongo`, `mongodb`, `redis`, `valkey`, `memcached`, `elasticsearch`, `opensearch`, `rabbitmq`, `kafka`, `minio`, `db`. The dev/start script comes from the root `package.json`; if the root has neither script, take the first `package.json` one level down (alphabetical) that has `dev`, then `start`, run as `<pm> --dir <sub> dev` for pnpm, `cd <sub> && <pm> run dev` otherwise. `.env.example` is checked at the root and one level down. — used by: T5.
- **D5:** The `cost=` format in the AC-28 log line, and what "equal to the badge" means in AC-29. — recommended default: `cost=$<cost_usd.toFixed(6)>` (or `cost=unknown`); AC-29 is satisfied when the log value rounded with the badge's `formatCostUsd` rule equals the badge text. — used by: T6, T14.
- **D6:** The "N of M files" subtitle when `files_total` is unknown. — revised by review F4: N = real `file_rank` row count; `M = stats.totalCandidates` only when present; otherwise "N files" + "coverage unknown since the last refresh" (no guessed M). — used by: T10, T11.

## Handoff to reviewers
- **Architecture reviewer:**
  - `modules/onboarding` imports nothing from `modules/repo-intel/*` or `modules/intent/*`. Facts come through `container.repoIntel` (wired in `routes.ts`) and types from `@devdigest/shared`; `redactSecrets` comes from `_shared`.
  - `OnboardingService` uses narrow deps (no `Container`) and is built once per plugin.
  - `RepoSnapshot` is a local port with a mock and a `ContainerOverrides` slot, and no adapter imports `modules/*` or `db/*`.
  - Pure builders (`tour-facts.ts`, `onboarding/helpers.ts`, `prompt.ts`) have no I/O and take time/tokenizer as parameters.
  - Handlers are parse → context → one call → reply; errors are `AppError` subclasses.
  - Client: `page.tsx` thin; no `api.*` outside `lib/api.ts`/`lib/hooks`; `import type` only from shared; nav edit limited to the sanctioned `nav.ts`; `MermaidDiagram` change is backward-compatible.
  - Both vendor copies of `onboarding-tour.ts` are identical; `knowledge.ts` edits limited to removing `Onboarding*`.
- **Security reviewer:**
  - Every repo-derived string in the prompt is inside `wrapUntrusted` with `INJECTION_GUARD` (T6 test with `</untrusted>`).
  - Script bodies are never read into output.
  - Git runs via `execFile` with validated refs and `--` separators; symlink blobs are blocked; size caps apply.
  - Model output is schema-parsed, grounded (paths/commands) and rendered with no raw HTML, no anchors, and Mermaid strict.
  - Open links use `rel="noopener noreferrer"` and point to a fixed `https://github.com/<full_name>/{blob|tree}/<sha>/<encoded path>`.
  - No secrets in the prompt, stored tour, `skeleton_detail`, `last_attempt.detail` or log (redaction test).
  - Workspace scoping on both endpoints (404 test).
  - No retries means a key-less or failing provider can't amplify spend.

## Unverified
- Exact `IconName` values available for the nav icon (`client/src/vendor/ui/icons`) — to verify by implementer (T4).
- Whether `runIncremental` writes `totalCandidates`/`bounded` into `repo_index_state.stats` like the full index — to verify by implementer (T10); D6 covers the gap.
- Whether `OpenAIProvider`/`AnthropicProvider` can be unit-tested with an injected client or `fetch` (the OpenRouter one can, `opts.fetch`) — to verify by implementer (T2).
- Existing test file names next to `reviewer-core/src/llm/openrouter.ts` and for `client/src/lib/github-urls.ts` — to verify by implementer (T2, T9).
- Whether `server/test/routes-smoke.test.ts` enumerates registered routes and must list the new ones — to verify by implementer (T12).
- Whether a seeded repo in the isolated e2e stack has a clone and an index (decides which state flow 13 asserts) — to verify by implementer (T13).
- `formatTokensTotal(8000, 1119)` returns `"9,119 tok"` — inferred from the `RunCostBadge` docstring (`RunCostBadge.tsx:9`), not executed.
- The OpenAI SDK version in `reviewer-core` accepts per-request `{ maxRetries }` options — standard in openai v4+, not checked against the lockfile.

## Delivery log
