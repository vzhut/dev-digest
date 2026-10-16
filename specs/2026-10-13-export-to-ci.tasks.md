# Task cards — Export to CI, SIMPLE version (plan: `/Users/volodymy.rzhutenko/emdash/worktrees/dev-digest-95942142/emdash-export-to-ci-tg8ip/specs/2026-10-13-export-to-ci.plan.md`, spec: `/Users/volodymy.rzhutenko/emdash/worktrees/dev-digest-95942142/emdash-export-to-ci-tg8ip/specs/2026-10-13-export-to-ci.md`)
Execution mode: multi-agent, 5 implementers. A = T1→T3 · B = T2 · D = T5→T6 · E = T4.
Read the card for your task ID. Where a card says "Contracts" or "Design", read the plan's `## Affected packages & contracts` / `## Design`. Where the plan's "Deviations from spec" table and the spec differ, **the Deviations table wins** (the user agreed on it).

**Rules for every card:** no new tests by the implementer. Acceptance = typecheck + existing tests green (+ build where stated). Stay inside the owned paths. Never hand-edit migrations or lockfiles (a lockfile changes only via `pnpm add` in T2/D1). Never log tokens, secrets or artifact bodies.

## T1 — Shared CI contracts (wave 1, implementer A)
- **Executor / Type / Depends-on / Risk:** implementer · core (shared, both copies) · none · low
- **Checkpoint:** yes (server + client typecheck)
- **Covers:** AC-7, AC-8, AC-17, AC-34, AC-54, AC-56, AC-60 (shapes only)
- **Fixed decisions:** the exact field lists are in the plan, "Affected packages & contracts". In summary: `AgentManifest` gets `version`, `skill_versions` and `post_as` (all `.nullish()`). Add `CiPostAs` and `CiTrigger`. `CiExportRequest` replaces `CiExportInput`. Add `CiWorkflowViolation` and `CiPreview`. `CiInstallation` gets `manifest_version`, `workflow_version`, `pr_url`, `status: pending|active` and `repo_id`. `CiInstallResult` replaces `CiExport`. `CiResultArtifact` gets `artifact_version: 2`, `repository`, `repository_id`, `head_sha`, `manifest_version`, `model`, `runner_version`, `node_version`, `verdict: pass|fail`, `blockers` and `skill_versions`, with numbers bounded. `CiRunItem` + `CiSyncResult` replace `CiRun`. These edit existing contracts deliberately; grep shows their only consumers are in agent-runner.
- **Owned paths:** `server/src/vendor/shared/contracts/eval-ci.ts`, `client/src/vendor/shared/contracts/eval-ci.ts`
- **Action:** edit the CI section (`eval-ci.ts:485-596` server, the matching block in the client copy) identically in both copies. Add `AgentManifest` and the `Provider`/`CiFailOn` imports to the client copy. Don't sync other parts of the client file.
- **Traps that apply:** new jsonb-adjacent optional fields use `.nullish()` (`server/INSIGHTS.md:161`).
- **Acceptance:** `cd server && pnpm typecheck` passes; `cd client && pnpm typecheck` passes. agent-runner typecheck errors that come only from the new artifact fields are expected and fixed in T3 (same spawn). No new tests by implementer.
- **Design pointer:** plan "Affected packages & contracts".

## T3 — agent-runner: artifact fields, post_as fallback, robust entry (wave 1, implementer A, after T1)
- **Executor / Type / Depends-on / Risk:** implementer · core (agent-runner) · T1 · medium
- **Checkpoint:** yes (agent-runner full)
- **Covers:** AC-17, AC-30–36 (unchanged behaviour kept), AC-34 fields
- **Fixed decisions:** `DEVDIGEST_POST_AS` is already read (`src/index.ts:24-33`). Add the fallback env → `manifest.post_as` → `github_review`. `RUNNER_VERSION` = `'2'`. `node_version` = `process.version`, passed from `index.ts`. `verdict` = gate triggered ? `fail` : `pass`. `head_sha` and `repository_id` come from the event payload (`pull_request.head.sha`, `repository.id`); hard-fail if missing. No reviewer-core revision.
- **Owned paths:** `agent-runner/src/artifact.ts`, `agent-runner/src/context.ts`, `agent-runner/src/run.ts`, `agent-runner/src/index.ts`, `agent-runner/src/run.test.ts` (fixture updates only), `agent-runner/README.md`, `scripts/dev.sh` (one comment/echo line)
- **Action:** implement the fields above in the artifact. Replace the entry guard with `import.meta.url === pathToFileURL(process.argv[1]).href`. Update existing test fixtures only where the new required fields break them. Document `cd agent-runner && pnpm install && pnpm build` (needed before exporting to CI) in the README, and add a note in `scripts/dev.sh`.
- **Traps that apply:** the guard with a space in the path (`server/INSIGHTS.md:12`). Keep the `<untrusted>` wrapping and the hard-fail paths untouched. Never print env values.
- **Acceptance:** `cd agent-runner && pnpm typecheck && pnpm test` green; `pnpm build` produces the bundle. **Execution gate:** from a scratch dir whose path has no spaces, `node <abs>/agent-runner/dist/index.js; echo $?` prints a line starting `[agent-runner] FAILED:` and then `1`. If the output file is not `dist/index.js`, or Node refuses it as CJS/ESM, STOP and report the actual file name, module format and error (plan R1). Don't invent a workaround outside the owned paths. No new tests by implementer.
- **Design pointer:** none.

## T2 — Server `ci` module: export (preview / install / zip / installations) + GitHub port methods + schema (wave 2, implementer B)
- **Executor / Type / Depends-on / Risk:** implementer · backend (server) · T1 · high
- **Checkpoint:** yes (server, wave 2)
- **Covers:** AC-6, 7, 9, 11, 12, 13, 17, 21–29, 37–39, 41, 42, 43 (simplified), OQ-8, OQ-17 (warning), OQ-20
- **Fixed decisions:**
  - D1 default: `cd server && pnpm add yaml@^2.6.1`.
  - Only connected workspace repos (`repo_id`). Only provider `openrouter` exports (`agent_not_exportable`, 422). A missing bundle → `runner_bundle_missing` (409).
  - Validator rules: `yaml_invalid`, `forbidden_trigger` (pull_request_target, issue_comment, pull_request_review_comment, workflow_run), `extra_permissions` (anything beyond `contents: read` + `pull-requests: write`, top-level or job-level), `unpinned_action` (`uses:` without `@<40 hex>`, local `./` excepted). Violations block install/PR (`workflow_invalid`, 422); the zip path still validates and also refuses invalid YAML (to keep it simple, the same rule applies).
  - Install: `commitFiles` on `devdigest/ci` (base = repo default branch) → `findOpenPr` → reuse, else `openPullRequest`. No reset, no `branch_conflict`.
  - GitHub error mapping: 401 → `token_missing`, 403 → `token_permission_missing` (message names contents, pull requests and workflows write), 404 → `repo_not_accessible`, else `github_unavailable`.
  - Installation upsert on (agent_id, repo): status `pending`, `manifest_version` = agent.version, `workflow_version` = `CI_WORKFLOW_VERSION` (1), `pr_url`. Zip also upserts `pending` with `pr_url null` and makes **no** GitHub call.
  - Preview returns the runner file as the placeholder `// bundled agent-runner, N bytes` (editable false). Install and zip use the real bundle bytes read from `config.agentRunnerBundlePath` (env `AGENT_RUNNER_BUNDLE_PATH`, default `<server cwd>/../agent-runner/dist/index.js`).
  - The workflow template is exactly as in plan T2 step 4: stable `name: DevDigest Review`, job id `review`; base-SHA checkout with `persist-credentials: false`; a "not installed on base yet" summary + `exit 0`; `node .devdigest/runner/index.mjs`; env `OPENROUTER_API_KEY`/`GITHUB_TOKEN`/`PR_NUMBER`/`DEVDIGEST_POST_AS`; upload-artifact `devdigest-result` `if: always()`; a `fork-notice` job without secrets. No PR-controlled text in any `run:`.
- **Owned paths:** `server/src/modules/ci/{constants,workflow,helpers,repository,service,routes}.ts`, `server/src/modules/index.ts`, `server/src/platform/config.ts`, `server/src/db/schema/ci.ts`, `server/src/db/migrations/**` (generated only), `server/src/db/rows.ts` (row type only), `server/src/db/client.ts` (only to add `Tx` if absent), `server/src/vendor/shared/adapters.ts`, `client/src/vendor/shared/adapters.ts`, `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts`, `server/package.json`, `server/pnpm-lock.yaml` (via `pnpm add` only)
- **Action:** follow plan T2 steps 1–8. Schema: in `ci_installations` add `manifestVersion int not null default 1`, `workflowVersion int not null default 1`, `prUrl text`, `status text ['pending','active'] not null default 'pending'` and a unique index (agentId, repo); then `pnpm db:generate` and `pnpm db:migrate`. Port: add `listWorkflowRuns`, `listRunArtifacts` and `downloadArtifact` + the `CiWorkflowRun`/`CiRunArtifactRef` types to both `adapters.ts` copies; implement them in octokit (errors → `ExternalServiceError` with the status in `details`) and in `MockGitHubClient` (fixtures via options, record calls). Pin the action SHAs after verifying them with `gh api repos/actions/checkout/git/ref/tags/<tag>` (same for upload-artifact). Services use narrow deps (`CiRepository`, `container.agentsRepo`, `() => container.github()`, `readRunnerBundle`, `log`); no container change; don't import `modules/agents/*`.
- **Traps that apply:** fine-grained PAT → 404 (`server/INSIGHTS.md:268`). Writing a workflow file needs the token's workflow permission (403). The `db:generate` rename prompt needs a TTY (`server/INSIGHTS.md:279`; pure adds should not prompt). Never log the token or the clone URL. Throw `AppError`, never `reply.status`.
- **Acceptance:**
  - `cd server && pnpm typecheck` passes.
  - `pnpm exec vitest run --exclude '**/*.it.test.ts'` is green (existing tests).
  - A generated migration + journal entry exists.
  - The onion §9 grep lines print nothing for `src/modules/ci`.
  - `grep -n "review-action\|OPENAI_API_KEY" server/src/modules/ci/` is empty.
  - No new tests by implementer.
- **Design pointer:** plan "Design" and T2 steps 1–8.

## T5 — Client: API + hooks, agent CI tab, Export Wizard, shared runs table (wave 2, implementer D)
- **Executor / Type / Depends-on / Risk:** implementer · ui (client) · T1 · medium
- **Checkpoint:** no (T6, run by the same spawn, is the client checkpoint)
- **Covers:** AC-1–6, 10–20, 37, 41–47, 50, 65 (deviations AC-19, 44, 48, 49, 51 apply)
- **Fixed decisions:**
  - Endpoints: `POST /agents/:id/ci/preview|install|zip` with body `CiExportRequest`. Zip returns `application/zip` (a blob download). `GET /agents/:id/ci/installations`. `POST /ci/runs/sync` returns `CiSyncResult`.
  - `useCiRuns` uses `queryFn = api.ciSyncRuns` and `refetchInterval: 60_000`.
  - Only the GHA target card ("recommended"); step order Target → Preview → Configure → Install.
  - Triggers default opened + synchronize. Post-as default `github_review`.
  - `OPENROUTER_API_KEY` is always shown as neutral "required — cannot be checked from DevDigest".
  - No Update CI config / Add repository buttons; **Add to CI** reopens the wizard (upsert).
  - "Outdated" = `installation.manifest_version < agent.version || installation.workflow_version < 1-constant`, computed in `CiTab/helpers.ts`.
  - The fork note appears on Configure and Install.
  - Install (PR) is disabled while `workflow_violations` is non-empty; zip stays available.
- **Owned paths:** `client/src/lib/api.ts`, `client/src/lib/hooks/ci.ts`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`, `.../AgentEditor/constants.ts`, `.../AgentEditor/_components/CiTab/**`, `client/src/components/ci-runs-table/**`, `client/messages/en/ci.json`, `client/messages/en/agents.json`
- **Action:** follow plan T5 steps 1–7. The wizard lives in `CiTab/_components/ExportWizard/`, with a child folder per step. It is a modal dialog with a focus trap, Escape/Close and `aria-current="step"`; the triggers are `aria-pressed` toggles and post-as is a radio group. `CiRunsTable` (`components/ci-runs-table/`) has columns repository, PR link, agent, verdict/status, findings by severity, cost (`—` if null), duration and job link. Fail CI on reuses the existing agent update mutation and `CI_FAIL_ON_VALUES`. All strings go through next-intl `ci.json` (reuse the existing `exportWizard`/`ciTab`/`runs` keys).
- **Traps that apply:** runtime imports from the `@devdigest/shared` barrel can fail only under webpack (caught by T6's `next build`). Import `@/lib/hooks/ci`, not a barrel. No `fetch` outside `lib/api.ts`.
- **Acceptance:** `cd client && pnpm typecheck` passes; `pnpm exec vitest run src/app/agents` is green (existing tests incl. `AgentEditor.test.tsx`). No new tests by implementer.
- **Design pointer:** plan "Design".

## T6 — Client: CI Runs page + GLOBAL sidebar entry (wave 2, implementer D, after T5)
- **Executor / Type / Depends-on / Risk:** implementer · ui (client) · T5 · low
- **Checkpoint:** yes (client, full suite + build)
- **Covers:** AC-59, 60, 62, 63, 64; AC-61 (agent + repo filters only)
- **Fixed decisions:** nav section `"GLOBAL"` with item `{ key: "ci-runs", label: "CI Runs", href: "/ci-runs", icon: <an existing IconName> }`. This is a sanctioned edit of `vendor/ui/nav.ts`; say so in the commit body. `activeKeyFor` already handles `/ci-runs`. Filtering is client-side via a pure `filterRuns` in `CiRunsView/helpers.ts`. Auto-refresh comes from `useCiRuns` (60 s); **Refresh** calls `refetch()`.
- **Owned paths:** `client/src/vendor/ui/nav.ts`, `client/src/app/ci-runs/**` (+ `client/messages/en/ci.json`, same owner D)
- **Action:** a thin `app/ci-runs/page.tsx` rendering `<CiRunsView />`. The View has title/subtitle, Refresh + "auto-refresh on", agent/repo selects, a skeleton, the "No CI runs yet" empty state, an error state with retry, and `<CiRunsTable>` newest first.
- **Traps that apply:** the nav tests assert the WORKSPACE/SKILLS LAB contents and unique keys/gKeys (`components/app-shell/nav.test.ts`). Don't add a `gKey` that collides.
- **Acceptance:** `cd client && pnpm typecheck && pnpm test` green. `pnpm build` succeeds and lists `/ci-runs` and `/agents/[id]` (stop `pnpm dev` first; both use `.next`). No new tests by implementer.
- **Design pointer:** none.

## T4 — Server ingest (pull model) + CI runs list (wave 3, implementer E)
- **Executor / Type / Depends-on / Risk:** implementer · backend (server) · T2 (T3 already landed) · high
- **Checkpoint:** yes (server, wave 3)
- **Covers:** AC-52, 53 (simplified), 54, 55, 56 (simplified), 57, 58, 60 (data), 62 (server)
- **Fixed decisions:**
  - There is a single endpoint, `POST /ci/runs/sync` → `CiSyncResult`; no inbound/unauthenticated endpoint exists.
  - Per installation: `listWorkflowRuns(repo, 'devdigest-review.yml', { perPage: 30 })`, completed runs only.
  - Key `"<run.id>:<run.run_attempt>"`, stored as `trace.ci_run_key`; skip runs whose key already exists.
  - Artifact `devdigest-result`, not expired, ≤ 64 KiB zipped/unzipped → `fflate.unzipSync` → `devdigest-result.json` → `JSON.parse` (try/catch) → `CiResultArtifact.safeParse`.
  - Verification: `artifact.repository_id === run.repository_id`, `artifact.head_sha === run.head_sha`, `run.path === '.github/workflows/devdigest-review.yml'`. On mismatch, reject: store nothing and log the reason.
  - A completed run without an artifact is stored with status `failed` (conclusion failure/cancelled/timed_out) or `skipped` (otherwise), with no findings and no cost.
  - Row: `agent_runs` with `source:'ci'`, **`prId: null`**, `provider:'openrouter'`, model, durationMs, costUsd, findingsCount, blockers, status `done|failed|skipped`, ranAt = run.updated_at, agentId = installation.agentId, plus a `run_traces` document `{ source:'ci', ci_run_key, repo, pr_number, pr_url, commit_sha, job_url, agent_name, manifest_version, model, verdict, critical, warning, suggestion, dependencies: { runner_version, node_version, skill_versions } }`. Both are written in one transaction, and the installation is then set to `active`.
  - A per-workspace in-process promise lock serializes `sync`. A GitHub error on one installation is logged and the loop continues.
  - The list is `agent_runs` source='ci' for the workspace joined with `run_traces`, newest first, limit 200. The agent name comes from the trace.
- **Owned paths:** `server/src/modules/ci/ingest.ts` (pure), `server/src/modules/ci/ingest.service.ts`, `server/src/modules/ci/repository.ts`, `server/src/modules/ci/routes.ts`, `server/src/modules/ci/constants.ts` (append only), `server/src/db/client.ts` (only if `Tx` is still absent)
- **Action:** `ingest.ts` holds `verifyArtifact` and `toCiRunRecord`/`toCiRunItem` (pure, no Drizzle, Fastify or SDK). `ingest.service.ts` holds `CiIngestService` with narrow deps (`CiRepository`, `() => container.github()`, `log`). Repository: `listWorkspaceInstallations`, `hasCiRunKey` (jsonb `trace->>'ci_run_key'`), `insertCiRun(tx, run, trace)`, `markInstallationActive`, `listCiRuns`. Route: `POST /ci/runs/sync`, a thin handler. Log only counts and reasons.
- **Traps that apply:** `agent_runs` goes terminal before `run_traces` in the local executor (`server/INSIGHTS.md:258`), so use one transaction here. Use `status='done'` for aggregates (`server/INSIGHTS.md:193`). Never set `pr_id` (AC-57). Artifact text is data, never HTML or a command.
- **Acceptance:** `cd server && pnpm typecheck` passes. `pnpm exec vitest run --exclude '**/*.it.test.ts'` is green. If Docker is up, `pnpm exec vitest run .it.test` is green. `grep -n "prId" server/src/modules/ci/*.ts` shows only `prId: null`. The onion §9 greps are empty for `modules/ci`. No new tests by implementer.
- **Design pointer:** plan "Design".

## After the implementers (parent)
1. `architecture-reviewer`, then `plan-verifier` (end of the pipeline). Point plan-verifier at the plan's "Deviations from spec" table.
2. ONE fix iteration with **at most two** fix subagents. Report whatever remains to the user; do not loop.
3. Optional (see plan "Possible follow-ups"): test-writer (validator, manifest/runner parity, ingest forged/mismatch/replay, artifact secret-leak), doc-writer, security review, `/pr-self-review`, manual demo-repo run, engineering-insights.
4. Append the Delivery log to the plan (parent).
