# Task cards — Onboarding Tour (plan: `/Users/volodymy.rzhutenko/Documents/AI Course/dev-digest/specs/2026-10-01-onboarding-tour.plan.md`, spec: `/Users/volodymy.rzhutenko/Documents/AI Course/dev-digest/specs/2026-10-01-onboarding-tour.md`)
Execution mode: multi-agent
Read the card for your task ID. Read the plan's `## Design` section only when the card points to it. The spec's AC text is authoritative on what a requirement *is*; the plan wins over this card on any mismatch. Commit on `lesson-05`, one commit per task (plan → *Commit slicing*). Unless your card says `Checkpoint: yes`, run only your own tests plus typecheck.

Fixed decisions used by several cards (plan → Open decisions; defaults in force):
- **D1:** in single-attempt mode, a schema-invalid response throws an error carrying `usage: {tokensIn, tokensOut, costUsd}`. A transport error or timeout records 0/0/null.
- **D2:** the hotness window is the 180 days before the committer date of `source_sha`. A history with ≤ 1 commit → `hotness_available: false`.
- **D3:** `llm_calls: 0` → the badge reads "0 LLM calls" with no tokens or cost; tooltip "No LLM call was made".
- **D4:** data-store compose services are those whose name equals or starts with `postgres|postgresql|mysql|mariadb|mongo|mongodb|redis|valkey|memcached|elasticsearch|opensearch|rabbitmq|kafka|minio|db`. The dev/start script comes from the root `package.json`, else the first sub-`package.json` (alphabetical) with `dev`, then `start`. `.env.example` is checked at the root and one level down.
- **D5:** log `cost=$<cost_usd.toFixed(6)>` or `cost=unknown`.
- **D6:** `M = files_total ?? files_indexed + files_skipped`.
- `GET /repos/:repoId/onboarding` → `{ status: 'none'|'ready'|'not_cloned'|'generating', tour?: Tour|null, index_sha: string|null }`, with precedence `generating` > `not_cloned` > `ready` > `none`. `tour` is kept while `generating` and omitted for `not_cloned`.
- `POST /repos/:repoId/onboarding/generate` → `Tour`; 409 `not_cloned`, 409 `generation_in_progress`, 404 outside the workspace.
- No DB migration: the whole `Tour` is stored in the existing `onboarding.json` jsonb column.

## T1 — Shared `Tour` contracts
- **Executor / Type / Depends-on / Risk:** implementer / core (server + client vendor shared) / none / medium
- **Checkpoint:** yes (client) · no (server)
- **Covers:** AC-2, AC-13, AC-23, AC-26, AC-30, AC-31 (contract basis for all)
- **Fixed decisions:**
  - New file `contracts/onboarding-tour.ts`, **byte-identical** in both copies, exported from both barrels.
  - It contains `TourMode`, `SkeletonReason`, `TourComplexity`, `TourUsage`, `TourIndexInfo`, `Tour` (exactly the spec's boundary contract; `last_attempt` `.nullish()`), `OnboardingTourResponse` (with `index_sha`) and `TourFacts` (`source_sha`, `index` = `TourIndexInfo` + `usable`, `unusable_reason: no_data|failed|degraded|flag_off|no_ranked_files|null`, `last_indexed_sha`; `stack`, `structure`, `routes`, `run_locally[{command, source_path}]`, `critical_paths[{path, computed_reason}]`, `reading_path[{path, score, pagerank, hotness, computed_reason}]`, `readme: {path, text}|null`).
  - Remove `OnboardingLink`, `OnboardingSection`, `Onboarding` from **both** `knowledge.ts` copies (no consumers) and update the doc comment in `server/src/vendor/shared/index.ts`. Change nothing else in `knowledge.ts`.
- **Owned paths:** `server/src/vendor/shared/contracts/onboarding-tour.ts`, `server/src/vendor/shared/contracts/knowledge.ts`, `server/src/vendor/shared/index.ts`, `client/src/vendor/shared/contracts/onboarding-tour.ts`, `client/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/index.ts`, `server/test/onboarding-contracts.test.ts`
- **Action:** Write the schemas and parse tests: full `llm` tour, skeleton tour, a tour with no `last_attempt` key, a response for each status.
- **Traps that apply:** fields added later to jsonb contracts must be `.nullish()` (`server/INSIGHTS.md:149`); the client imports these only with `import type` (`client/INSIGHTS.md:125`); the two `knowledge.ts` copies already differ, so don't sync them.
- **Acceptance:**
  - `diff` of the two `onboarding-tour.ts` copies is empty.
  - `grep -rn "OnboardingSection\|OnboardingLink" server/src client/src` returns nothing.
  - `server/test/onboarding-contracts.test.ts` passes.
  - Server and client `pnpm typecheck` pass.
  - Client full `pnpm test` passes (checkpoint).
- **Design pointer:** plan → *Affected packages & contracts*

## T2 — Single-attempt structured call on the LLM port
- **Executor / Type / Depends-on / Risk:** implementer / core + backend adapters / none / medium
- **Covers:** AC-15, AC-20, AC-26
- **Fixed decisions:**
  - `StructuredRequest.singleAttempt?: boolean` and exported type `StructuredCallUsage { tokensIn, tokensOut, costUsd }` go in `server/src/vendor/shared/adapters.ts` only (server-copy-only precedent: `sessionId`).
  - With the flag: one request, no SDK/`withRetry` transport retry, no re-prompt. On a schema failure, throw an error with `usage` attached (D1).
  - Without the flag, behaviour is unchanged.
- **Owned paths:** `server/src/vendor/shared/adapters.ts`, `reviewer-core/src/llm/openrouter.ts`, its test file next to it (name to verify), `server/src/adapters/llm/openai.ts`, `server/src/adapters/llm/anthropic.ts`, `server/test/llm-single-attempt.test.ts`
- **Action:** OpenRouter passes `{ maxRetries: 0 }` as the per-request SDK option. OpenAI/Anthropic skip `withRetry` and the loop when the flag is set.
- **Traps that apply:** `reviewer-core/**` changes also trigger `server-unit` CI; the constructor's `maxRetries: 2` (`reviewer-core/src/llm/openrouter.ts:56`) is the transport retry to disable.
- **Acceptance:**
  - Injected `fetch` returning 500 → exactly 1 fetch call, then reject.
  - Schema-invalid 200 → 1 call, `err.usage.tokensIn > 0`.
  - Existing provider tests green.
  - `cd reviewer-core && npm test && npm run build` (full suite: this is reviewer-core's only task).
  - `cd server && pnpm exec vitest run test/llm-single-attempt.test.ts && pnpm typecheck`.
- **Design pointer:** none

## T3 — `RepoSnapshot` port + mock + container
- **Executor / Type / Depends-on / Risk:** implementer / backend adapter / none / medium
- **Checkpoint:** yes (server)
- **Covers:** AC-7, AC-8, AC-11, AC-12, AC-13, AC-17, NFR Security
- **Fixed decisions:**
  - Local port in `server/src/adapters/git/repo-snapshot.ts` with: `headSha(cloneDir)`, `commitDate(cloneDir, sha)`, `listFiles(cloneDir, sha)` → `{files, truncated}` (cap 200,000), `readText(cloneDir, sha, path, maxBytes)` → `ok|missing|blocked` (symlink blob/unsafe path → `blocked`), and `churn(cloneDir, sha, since)` → `{commits, counts}`.
  - Also `cloneExists(cloneDir)` → `boolean` (TD-1): the single place that touches the filesystem for "is there a clone"; the onboarding service/routes call it through the port and never import `node:fs`.
  - Git blobs only, never the working tree.
  - `execFile` (no shell), refs validated `/^(HEAD|[0-9a-f]{7,40})$/i`, `--` before paths, timeouts set, raw error text never surfaced.
- **Owned paths:** `server/src/adapters/git/repo-snapshot.ts`, `server/src/adapters/mocks.ts`, `server/src/platform/container.ts`, `server/test/repo-snapshot.test.ts`
- **Action:** Implement the port, add a `FakeRepoSnapshot` mock, a lazy `repoSnapshot` getter and a `ContainerOverrides.repoSnapshot` slot.
- **Traps that apply:** follow the path guard in `server/src/adapters/git/repo-file-reader.ts:25-60`; the default clone has depth 1 (`server/src/modules/repos/constants.ts:9`).
- **Acceptance:**
  - Temp-repo test: a `README.md` symlink to `/etc/hosts` → `blocked`.
  - `../x` and `-x` → `blocked`.
  - `cloneExists` → `true` for a real clone dir, `false` for a missing path and for a path that is not a git repo; `FakeRepoSnapshot` exposes it too (TD-1).
  - `listFiles` returns every committed path.
  - `churn` counts on a 3-commit history; a `--depth 1` clone → `commits === 1`.
  - Server unit suite `pnpm exec vitest run --exclude '**/*.it.test.ts'` + `pnpm typecheck` pass after T1/T2 land (checkpoint).
- **Design pointer:** plan → *Design / Placement*

## T4 — Sidebar item and active-key fix
- **Executor / Type / Depends-on / Risk:** implementer / ui / none / low
- **Checkpoint:** no (client)
- **Covers:** AC-1
- **Fixed decisions:**
  - Nav key `onboarding-tour`, href `/repos/:repoId/onboarding`, placed between `pulls` and `context`; no `gKey`.
  - `activeKeyFor` matches only `/^\/repos\/[^/]+\/onboarding(\/|$)/`.
  - Editing `vendor/ui/nav.ts` is the sanctioned exception; say so in the commit body.
- **Owned paths:** `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts`, `client/src/components/app-shell/helpers.test.ts` (new), `client/src/components/app-shell/nav.test.ts`
- **Action:** Add the item using an icon that exists in `IconName` (to verify), narrow the matcher, add the tests.
- **Traps that apply:** the g-shortcut uniqueness test (`nav.test.ts:13-18`).
- **Acceptance:**
  - WORKSPACE keys are `["pulls","onboarding-tour","context"]`.
  - `/repos/r1/onboarding` → `onboarding-tour`; `/onboarding` → not `onboarding-tour`; `/repos/r1/context` → `context`.
  - `pnpm exec vitest run src/components/app-shell && pnpm typecheck` pass.
- **Design pointer:** none

## T5 — Pure tour-fact builders + junk paths
- **Executor / Type / Depends-on / Risk:** implementer / backend domain / T1 / medium
- **Checkpoint:** no (server)
- **Covers:** AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-21
- **Fixed decisions:**
  - `junk-paths.ts`: the existing list from `server/src/modules/repo-intel/service.ts:759-774`, matched against `'/' + path.toLowerCase()`.
  - Reading path: `score = pagerank × (1 + hotness)`, `hotness = count / max` (0 when max is 0); ties by path asc; cap 8; junk excluded.
  - Critical paths: seeds = top non-junk files; junk dropped anywhere in a chain; plus route files; de-duplicated; ordered by score then path; cap 6.
  - Structure: depth ≤ 2, count desc then path, cap 40, excluding `node_modules|dist|build|coverage|.next|out|vendor|.git`.
  - TD-4: the always-skipped directory names (`.git`, `node_modules`) live in ONE new shared constant + case-insensitive segment matcher in `server/src/modules/_shared/skipped-dirs.ts` (macOS case-insensitivity, as Project Context's guard); `buildStructure` uses it. Do not add a third literal copy. Re-pointing `project-context/service.ts` at it is out of scope (other lesson's module) — note it in the commit body.
  - Routes: cap 50, ordered by file score then path.
  - Run-locally order: install, env copy, compose up (D4), dev/start. Script **names** only.
  - Computed reason: `imported by N files · rank pNN`.
  - Constants are exported `UPPER_SNAKE_CASE` at the top of `tour-facts.ts`. Outputs use `@devdigest/shared` `TourFacts` piece types.
- **Owned paths:** `server/src/modules/repo-intel/junk-paths.ts`, `server/src/modules/repo-intel/tour-facts.ts`, `server/src/modules/_shared/skipped-dirs.ts`, `server/test/repo-intel-tour-facts.test.ts`, `server/test/repo-intel-junk-paths.test.ts`, `server/test/skipped-dirs.test.ts`
- **Action:** Write pure functions `detectStack`, `buildStructure`, `buildRoutes`, `buildRunLocally`, `computeHotness`, `rankReadingPath`, `selectCriticalPaths`, `computedReason`. No I/O.
- **Traps that apply:** never emit a script body (spec edge case: malicious `dev`).
- **Acceptance:** tests reproduce each AC's Verify hint:
  - AC-8 stack fixture.
  - AC-9: 45 dirs → 40.
  - AC-10: three-file ordering.
  - AC-11: `pnpm install` / `cp .env.example .env` / `docker compose up -d postgres redis` / `pnpm dev`, plus an `npm` fallback.
  - AC-12: the hotness overtake; `test/x.ts` and `src/a.test.ts` excluded; 12 → 8.
  - AC-14: chain fixture, ≤ 6.
  - AC-21: reason format.
  - TD-4: `skipped-dirs.test.ts` — `node_modules`, `NODE_MODULES`, `.Git` segments are skipped at any depth; `src/node_modulesx` is not; `grep -rn "node_modules" server/src/modules/repo-intel/tour-facts.ts` finds no string literal (it imports the constant).
  - `pnpm exec vitest run test/repo-intel-tour-facts.test.ts test/repo-intel-junk-paths.test.ts test/skipped-dirs.test.ts && pnpm typecheck` pass.
- **Design pointer:** none

## T6 — Onboarding pure helpers, prompt, output schema, system prompt
- **Executor / Type / Depends-on / Risk:** implementer / backend domain / T1 / high
- **Checkpoint:** yes (server)
- **Covers:** AC-16, AC-17, AC-19, AC-20, AC-21, AC-28, AC-32, AC-33, NFR Security (secrets)
- **Fixed decisions:**
  - Constants: `LLM_TIMEOUT_MS=90_000`, `PROMPT_TOKEN_BUDGET=16_000`, `README_EXCERPT_TOKENS=1_500`, `README_CHAR_PRECAP=12_000`, first tasks 3–5.
  - The LLM output schema is the spec's.
  - All repo text goes through `wrapUntrusted` with `INJECTION_GUARD` (from `@devdigest/reviewer-core`).
  - Over budget: truncate routes from the end, then structure.
  - Merge keeps deterministic lists and order, attaches text by path/command, and drops unknown paths, commands and tasks (path neither file nor dir) into `dropped_items`.
  - Skeleton: `summary_md: null`, `first_tasks: []`, computed reasons only.
  - Log line exactly per AC-28, with D5 cost.
  - `redactSecrets` moves to `modules/_shared/redact.ts`; `intent/helpers.ts` re-exports it.
- **Owned paths:** `server/src/modules/onboarding/constants.ts`, `server/src/modules/onboarding/output-schema.ts`, `server/src/modules/onboarding/prompt.ts`, `server/src/modules/onboarding/helpers.ts`, `server/src/prompts/onboarding.system.md`, `server/src/modules/_shared/redact.ts`, `server/src/modules/intent/helpers.ts`, `server/test/onboarding-helpers.test.ts`, `server/test/onboarding-prompt.test.ts`
- **Action:**
  - `buildOnboardingPrompt`, `fitPromptToBudget(facts, count)`, `excerptReadme(text, count)`.
  - `mergeModelOutput(facts, output, pathKinds)`, `buildSkeleton(facts, reason, detail)`, `classifyIndex`, `formatGeneratedLog`, `toLastAttempt`, `redactDetail`.
  - Rewrite `onboarding.system.md` for the five sections.
- **Traps that apply:** pre-cap characters before tokenizing, because js-tiktoken is quadratic on long runs (`server/INSIGHTS.md:204`); don't copy the ad-hoc delimiter in `server/src/modules/conventions/prompt.ts`.
- **Acceptance:**
  - Merge: reorder + extra file → computed order, extra absent.
  - Hallucinated task + invented command → `dropped_items = 2`.
  - All tasks dropped → `first_tasks: []`, `mode: llm`.
  - Skeleton deep-equals the fixture.
  - Exact log strings.
  - Redaction removes the key.
  - Prompt: `</untrusted>` + "ignore previous instructions" stays inside one block.
  - 5,000-file / 2,000-route fixture ≤ 16,000 tokens (real tokenizer), routes truncated first; README ≤ 1,500 tokens.
  - `test/intent-helpers.test.ts` still green.
  - Server unit suite + `pnpm typecheck` pass (checkpoint).
- **Design pointer:** plan → *Design / Generation*

## T7 — Onboarding repository
- **Executor / Type / Depends-on / Risk:** implementer / backend driven adapter / T1 / low
- **Checkpoint:** no (server)
- **Covers:** AC-23, AC-26, AC-31, AC-37
- **Fixed decisions:**
  - Existing table `onboarding(repo_id PK, json jsonb, generated_at)`; no migration, no `db:generate`.
  - Reads join `repos` on `workspace_id`.
  - An invalid stored json is treated as no tour, and the caller logs it.
- **Owned paths:** `server/src/modules/onboarding/repository.ts`, `server/test/onboarding-repository.it.test.ts`
- **Action:** Methods `getRepoForWorkspace(workspaceId, repoId)`, `getTour(workspaceId, repoId)` (`Tour.safeParse`), `saveTour(repoId, tour)` (upsert) and `setLastAttempt(repoId, lastAttempt)`.
- **Traps that apply:** DB tests must be named `*.it.test.ts` (`server/AGENTS.md`).
- **Acceptance:**
  - Round-trip of every `Tour` field incl. `usage` and `last_attempt`.
  - Another workspace → null.
  - Stored json without a `last_attempt` key parses.
  - `pnpm exec vitest run test/onboarding-repository.it.test.ts && pnpm typecheck` pass.
- **Design pointer:** none

## T8 — Client API + hooks
- **Executor / Type / Depends-on / Risk:** implementer / ui data layer / T1 / low
- **Checkpoint:** no (client)
- **Covers:** AC-4, AC-24, AC-25
- **Fixed decisions:**
  - Query key `["onboarding-tour", repoId]`.
  - `refetchInterval: 2000` only while `status === "generating"`.
  - Mutation success writes `{status:"ready", tour, index_sha: previous}` and invalidates.
  - 409 `generation_in_progress` → invalidate and surface the error.
  - Types from shared via `import type` only.
  - TD-3: export only what T11 consumes; no speculative hooks or query-key entries (Project Context left `useContextRoots` / `contextKeys.roots` unused).
- **Owned paths:** `client/src/lib/api.ts`, `client/src/lib/hooks/onboarding.ts`, `client/src/lib/hooks/onboarding.test.tsx`
- **Action:** Add `api.getOnboardingTour`, `api.generateOnboardingTour`, `useOnboardingTour`, `useGenerateOnboardingTour`.
- **Traps that apply:** `client/INSIGHTS.md:125` (barrel value imports); precedent `client/src/lib/hooks/context.test.tsx`.
- **Acceptance:**
  - Mount → GET only, no POST.
  - Mutation posts to `/repos/r1/onboarding/generate`.
  - 409 → refetch.
  - Polling stops at `ready`.
  - TD-3: every export of `hooks/onboarding.ts` (and each key in its key factory) is imported by T11's view — checked after T11 with `grep -rn "<name>" client/src` per export; an unused one is removed.
  - `pnpm exec vitest run src/lib/hooks/onboarding.test.tsx && pnpm typecheck` pass.
- **Design pointer:** none

## T9 — Section cards, inert markdown, Mermaid fallback, tree URL
- **Executor / Type / Depends-on / Risk:** implementer / ui / T1 / medium
- **Checkpoint:** yes (client)
- **Covers:** AC-3 (toggle), AC-13 (note), AC-14, AC-16 (display), AC-17 (0-task message), AC-18, AC-21, AC-33 (render), AC-34, AC-35, NFR a11y/i18n
- **Fixed decisions:**
  - Section ids `architecture`, `critical-paths`, `run-locally`, `reading-path`, `first-tasks` live in `TourSections/constants.ts`, re-exported from its `index.ts`.
  - Cards start expanded; the toggle is a `<button aria-expanded aria-controls>`; the heading has `tabIndex={-1}`.
  - Markdown: `react-markdown` + `remark-gfm`, `skipHtml`, anchors rendered as `<span>`. Don't use the UI kit `Markdown`: it renders `<a href>`.
  - The computed reason is always shown as a dim suffix.
  - Open links: blob URL for a file, tree URL for a dir, at `tour.source_sha`, `target="_blank" rel="noopener noreferrer"`.
  - Copy uses `navigator.clipboard.writeText` + `useToast`.
  - `MermaidDiagram` gets an optional `fallback` prop (default unchanged).
  - `onboarding.json` is **rewritten** as `{ page: {…}, sections: {…} }`; this task writes `sections.*`.
- **Owned paths:** `client/src/app/repos/[repoId]/onboarding/_components/TourSections/**`, `client/src/components/mermaid-diagram/MermaidDiagram.tsx`, `client/src/components/mermaid-diagram/MermaidDiagram.test.tsx`, `client/src/lib/github-urls.ts`, `client/src/lib/github-urls.test.ts`, `client/messages/en/onboarding.json`
- **Action:** Build `SectionCard`, `TourMarkdown`, `ArchitectureCard`, `CriticalPathsCard`, `RunLocallyCard` (with the review-before-running notice and the empty line), `ReadingPathCard` (hotness note), `FirstTasksCard` (text complexity badge; skeleton or 0-task message) and `OpenOnGitHubLink`. Add `githubTreeUrl`.
- **Traps that apply:** `fireEvent`, not `userEvent` (`client/INSIGHTS.md:85`); `'use client'` on every file importing `@devdigest/ui` (`client/INSIGHTS.md:56`); `import type` from shared (`client/INSIGHTS.md:125`).
- **Acceptance:**
  - Toggle flips `aria-expanded` and hides the body.
  - `<script>` + `[x](javascript:alert(1))` render inert with no link role.
  - Blob and tree `href`/`target`/`rel`.
  - Clipboard gets the exact command; toast and notice shown.
  - Hotness note shown when `hotness_available: false`.
  - Skeleton: computed reasons, first-tasks message, no task cards.
  - `MermaidDiagram` with `chart="not a diagram"` shows the fallback.
  - Full client `pnpm test` + `pnpm typecheck` pass (checkpoint).
- **Design pointer:** plan → *Design / Client placement*

## T10 — Repo-intel facade: `collectTourFacts` + `classifyPaths`
- **Executor / Type / Depends-on / Risk:** implementer / backend facade + repository / T1, T3, T5 / high
- **Checkpoint:** yes (server)
- **Covers:** AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-17, AC-19, AC-31, NFR Performance
- **Fixed decisions:**
  - Unusable index: no state row → `no_data`; status `failed` → `failed`; status `degraded` → `degraded`; `!config.repoIntelEnabled` → `flag_off`; zero `file_rank` rows → `no_ranked_files`.
  - `source_sha = lastIndexedSha || snapshot.headSha`; every clone read happens at `source_sha` through `container.repoSnapshot`.
  - Churn window per D2.
  - `files_total = stats.totalCandidates ?? null`, `bounded = (stats.bounded ?? 0) > 0`.
  - README candidates: `README.md`, `readme.md`, `README` at the root.
  - Hotness is **not** written to `file_rank`.
- **Owned paths:** `server/src/modules/repo-intel/service.ts`, `server/src/modules/repo-intel/types.ts`, `server/src/modules/repo-intel/repository.ts`, `server/src/modules/repo-intel/README.md`, `server/test/repo-intel-tour-facts.it.test.ts`
- **Action:**
  - Add `collectTourFacts(repoId)` and `classifyPaths(repoId, sha, paths)` → `Record<path,'file'|'dir'|'missing'>` to the `RepoIntel` interface and service.
  - New repository reads: `getAllRankRows`, `getInboundCounts`, `getAllEndpointFacts`, `getIndexStats`.
  - Replace the local junk list in `service.ts` with an import from `junk-paths.ts`. The commit body notes that conventions sampling now excludes root-level `test/`.
  - Fix the README's "PageRank + git hotness" claim.
- **Traps that apply:**
  - `getTopFilesByRank` returns `[]` when the flag is off (`service.ts:690`), so detect `flag_off` explicitly.
  - `tryGetIndexState` swallows errors (`repository.ts:236`).
  - Don't copy the onion D9 deviation (concrete adapter imports).
  - Whether `runIncremental` writes `totalCandidates`/`bounded` is unverified; D6 covers it.
- **Acceptance:** `repo-intel-tour-facts.it.test.ts`:
  - Two collections are `toEqual`, with 0 calls on a counting fake LLM.
  - Depth-1 clone → `hotness_available: false` and pagerank order.
  - Each of the five unusable cases gives its reason.
  - Partial/bounded index → `files_total`/`bounded`.
  - `classifyPaths` returns file/dir/missing.
  - 5,000-file fixture collects in ≤ 3,000 ms (env slack documented).
  - Full server `pnpm test` (Docker) + `pnpm typecheck` pass, incl. conventions, blast and repo-intel tests (checkpoint).
- **Design pointer:** plan → *Design / Generation*

## T11 — Onboarding Tour page and view
- **Executor / Type / Depends-on / Risk:** implementer / ui / T4, T8, T9 / medium
- **Checkpoint:** yes (client)
- **Covers:** AC-1 (breadcrumb), AC-2, AC-3 (nav list, fragment, focus, post-load scroll), AC-4, AC-5, AC-6, AC-22, AC-23 (notice), AC-24 (disabled + progress), AC-25, AC-27, AC-30, AC-31, AC-36, NFR a11y/i18n
- **Fixed decisions:**
  - Thin `page.tsx` with `generateMetadata` from `onboarding.page.title`.
  - Breadcrumb `[repo full_name, "Onboarding Tour"]`.
  - Usage label "`<n>` LLM call(s) · `<tokens>` tok · `<cost>`" via `formatTokensTotal`/`formatCostUsd`, with D3 for 0 calls and the model in the tooltip.
  - Stale when `index_sha && index_sha !== tour.source_sha`.
  - "N of M" subtitle + coverage note when bounded/partial (D6).
  - Share copies `origin + pathname + hash` with no API call.
  - Regenerate has no confirm and a tooltip saying it makes one LLM call.
  - The progress region uses `role="status"`/`aria-live="polite"`.
  - The TOC is a `<nav aria-label>`; a click scrolls, focuses the heading and runs `history.replaceState('#id')`.
  - After load, scroll to `location.hash` if it is a section id.
- **Owned paths:** `client/src/app/repos/[repoId]/onboarding/page.tsx`, `client/src/app/repos/[repoId]/onboarding/_components/OnboardingTourView/**`, `client/messages/en/onboarding.json` (adds `page.*`)
- **Action:**
  - `OnboardingTourView` covers the states loading / error+retry / not_cloned / none / generating / ready, with `useRepoNotFound`.
  - Sub-components `TourUsageBadge`, `TourBanners` (skeleton ×3, partial, last-attempt, stale) and `TourToc`.
  - Pure `helpers.ts` + tests.
  - TD-2: keep `OnboardingTourView.tsx` ≤ 200 lines (Project Context's view reached ~292 and needed an extraction); state/guard logic goes in a `use…` hook file and repeated rows in their own sub-component rather than growing the view.
- **Traps that apply:** don't import `@devdigest/ui` in `page.tsx` (`client/INSIGHTS.md:56`); `fireEvent` (`client/INSIGHTS.md:85`); run `pnpm build` only with no `next dev` running (`client/INSIGHTS.md:135`).
- **Acceptance:** view test (hooks mocked at `@/lib/hooks/onboarding`) covers AC-1, 2, 3, 4, 5, 6, 22, 23, 24, 25, 27 ("1 LLM call · 9,119 tok · $0.0012"; null → "—"), 30, 31 ("5000 of 12450"), and 36 (clipboard URL with `#reading-path`, no API call). TD-2: `wc -l` of `OnboardingTourView.tsx` ≤ 200. TD-3: no unused export in `hooks/onboarding.ts` (see T8). Full client `pnpm test`, `pnpm typecheck` and `pnpm build` pass (checkpoint).
- **Design pointer:** plan → *Design / Client placement*

## T12 — Onboarding service, routes, registration
- **Executor / Type / Depends-on / Risk:** implementer / backend / T2, T6, T7, T10 / high
- **Checkpoint:** yes (server)
- **Covers:** AC-4, AC-6, AC-15, AC-16, AC-17, AC-19, AC-20, AC-23, AC-24, AC-25, AC-26, AC-28, AC-30, AC-37
- **Fixed decisions:**
  - Narrow deps: `repo`, `facts`, `classifyPaths`, `indexSha`, `cloneExists`, `llm`, `resolveModel`, `tokenizer`, `log`. No `Container`, no `modules/repo-intel` import.
  - TD-1: the `not_cloned` check calls the injected `cloneExists` (wired in `routes.ts` from `container.repoSnapshot.cloneExists`, T3). No `node:fs`/`fs` import and no `stat` in `routes.ts` or `service.ts` (do not copy `project-context/routes.ts`'s `cloneExists`).
  - The service is built once per plugin in `routes.ts`, so the in-flight `Map` is shared. Set the inflight entry **before** the first await; delete it in `finally`.
  - Order: 404 → 409 `not_cloned` → 409 `generation_in_progress` → facts → `index_degraded` skeleton (no `resolveModel`/`llm` call) → `ConfigError` → `llm_unavailable` → `prompt.assembled` log → `withTimeout(completeStructured({singleAttempt:true, maxRetries:0, timeoutMs:90_000}), 90_000)` → merge or `llm_failed` (usage from `err.usage` per D1) → persist → one `onboarding: generated` log line.
  - A skeleton with a stored `llm` tour → `setLastAttempt` and return the stored tour. A successful `llm` tour clears `last_attempt`.
  - Add `ConflictError` (409, code) to `platform/errors.ts`.
- **Owned paths:** `server/src/modules/onboarding/service.ts`, `server/src/modules/onboarding/routes.ts`, `server/src/modules/index.ts`, `server/src/platform/errors.ts`, `server/test/onboarding-service.test.ts`, `server/test/onboarding.it.test.ts`, `server/test/routes-smoke.test.ts` (only if it lists routes)
- **Action:** Implement `get` and `generate`; add `GET /repos/:repoId/onboarding` and `POST /repos/:repoId/onboarding/generate` with shared Zod schemas and thin handlers; register the module.
- **Traps that apply:**
  - Inject fail-fast fakes for `openai`, `anthropic` and `openrouter`, or tests make paid calls on a machine with a key (`server/INSIGHTS.md:229-245`).
  - Assert on `code`/`statusCode`, not `name` (`server/INSIGHTS.md:378`).
  - OpenRouter ignores `timeoutMs`, so keep the race (`server/src/modules/intent/service.ts:96-103`).
- **Acceptance:**
  - Service test:
    - Calls: 1 call ok; schema-invalid → 1 call `llm_failed`; throwing → 1 call, no retry.
    - Index: five index cases → 0 calls `index_degraded`.
    - Key: no key → 0 calls `llm_unavailable`; detail contains no secret.
    - Failed regeneration keeps the full tour, with `last_attempt.usage.llm_calls === 1`.
    - Concurrency: two concurrent generations → 1 LLM call, the second gets 409.
    - Logs: one `onboarding: generated` line + one `prompt.assembled` for `llm`; skeleton-by-index has no `prompt.assembled`; no README text in logs.
    - `get` → 0 calls.
  - `.it`:
    - Another workspace → 404 on both endpoints.
    - `clone_path` null → 409 `not_cloned`, and `GET` → `not_cloned`.
    - Every AC-26 field after `llm`, skeleton-by-index and skeleton-by-failure generations.
    - `GET` returns `index_sha`.
  - Onion grep checklist is clean for `modules/onboarding`, including TD-1: `grep -rnE "from ['\"](node:)?fs" server/src/modules/onboarding` → no match; the service test drives `not_cloned` through a fake `cloneExists`, not a temp dir.
  - Full server `pnpm test` + `pnpm typecheck` pass (checkpoint).
- **Design pointer:** plan → *Design / Generation*, *Design / Placement*

## T13 — e2e flow 13
- **Executor / Type / Depends-on / Risk:** implementer writes; parent runs / e2e / T11, T12 / medium
- **Covers:** AC-1, AC-4 or AC-6, AC-2/AC-21 (when a seeded clone exists)
- **Fixed decisions:** assert text, not landmark roles. The e2e stack has no LLM key, so a cloned and indexed seed produces an `llm_unavailable` skeleton. The `clonePath: null` seed shows `not_cloned`.
- **Owned paths:** `e2e/specs/13-onboarding-tour.flow.json`
- **Action:** Follow `e2e/docs/writing-flows.md`:
  1. `/onboarding` still shows Add repository.
  2. Click sidebar "Onboarding Tour" for a seeded repo.
  3. Assert the breadcrumb and one deterministic state.
  - Which seed has a clone is unverified; check before writing the flow.
- **Traps that apply:** CI Chrome role differences (commits `a8756e8`, `ddc72d6`; `e2e/INSIGHTS.md`).
- **Acceptance:** `./scripts/e2e.sh` passes, incl. an unchanged `06-onboarding` and the new `13-onboarding-tour`.
- **Design pointer:** none

## T14 — Validation, AC-29 demo, insights, Delivery log
- **Executor / Type / Depends-on / Risk:** parent / all / T13 / low
- **Covers:** AC-29, NFR Performance/Cost evidence, verification of all ACs
- **Fixed decisions:** D5 governs the log-vs-badge cost comparison. Only the Delivery-log sections of the spec and plan are edited.
- **Owned paths:** Delivery-log sections of `specs/2026-10-01-onboarding-tour.md` and `specs/2026-10-01-onboarding-tour.plan.md`; `server/INSIGHTS.md`, `client/INSIGHTS.md`, `e2e/INSIGHTS.md`, `INSIGHTS.md`
- **Action:**
  - Run all verify commands and `./scripts/e2e.sh`.
  - Run the demo on an unfamiliar public JS/TS repo. Record the repo name, the `onboarding: generated … llm_calls=1` log line, a screenshot of the badge and `duration_ms`.
  - Apply `engineering-insights`, then `/pr-self-review`.
- **Traps that apply:** a key on the machine makes "hermetic" tests paid (`server/INSIGHTS.md:229`).
- **Acceptance:** all green; the AC-29 evidence is in the Delivery log.
- **Design pointer:** none
