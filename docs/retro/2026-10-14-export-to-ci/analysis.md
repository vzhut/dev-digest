# Export to CI (worktree B): run analysis, 2026-10-14

Purpose: one place with everything needed to continue or analyse this run in a new chat. Facts below were
re-collected from the repo, GitHub (`vzhut/conventions-demo`) and the local studio DB on 2026-10-14; where
something is an inference or unverified it says so. Companion files in this folder:

| File | What it is |
|---|---|
| `logs/ci-runner-step-excerpts.txt` | "Run the DevDigest agent" step + runner lines of three real Actions runs (secrets are masked `***` by GitHub) |
| `logs/ci-artifact-run-38531461473.json` | the real `devdigest-result.json` of the CRITICAL run |
| `logs/generated-workflow-as-installed.yml` | the workflow as it sits on `master` of the demo repo (the OLD two-job version) |
| `logs/github-actions-runs.tsv`, `logs/github-prs.tsv` | runs and PRs of the demo repo |
| `logs/studio-db-snapshot.txt` | `ci_installations`, `agent_runs` (source='ci') and `run_traces` rows from the studio DB |
| `check-token.sh` | diagnostic for the token the studio really uses (prints only codes and GitHub messages) |

Spec / plan / tasks (with Delivery log): `specs/2026-10-13-export-to-ci.md`, `.plan.md`, `.tasks.md`.
Retro entry (agent costs): `docs/retro/ledger.md`, last entry "Export to CI (worktree B)".

## 1. Status in one paragraph

The feature works end to end on a real repository. Export wizard opened a PR from `devdigest/ci`; after merging it
and adding `OPENROUTER_API_KEY`, test PRs got a review from the bundled runner; a CRITICAL finding made the check
red (exit 1); the studio ingested the runs into `agent_runs` (`source='ci'`, `pr_id` null) and the CI tab shows the
installation as `active`. Nothing is committed: branch `emdash/export-to-ci-tg8ip` at `2d78769` holds ~28 modified
and ~50 new (untracked) files plus the three spec files. Migration `0018_lush_plazm` is applied in the local DB
(the installation row has the new columns).

## 2. Timeline

1. Spec: `spec-creator` (188k tokens) wrote the EARS spec (65 ACs, 20 open questions). It wrote it into the MAIN
   checkout because my prompt named no worktree; copied by hand later.
2. Plan v1 (10 tasks, single agent, 692 lines, 249k tokens, 28 min), then the user asked for a SIMPLE version.
   Plan v2 (6 tasks, 5 implementers, 284 lines, 193k tokens). One planner run died on an API rate limit.
3. Decisions (user): pull ingest, no `pr_id`, block non-OpenRouter agents, fork PRs skipped, neutral secret status,
   hide CircleCI/Jenkins/CLI, block Install on invalid workflow, keep wizard step order, add `yaml@^2.6.1`,
   Preview warning only for a second agent in the same repo, implementer writes no tests, fix loop 1 round / max 2
   agents.
4. Implementation in 3 waves (A: contracts+runner, B: server export, D: client, E: ingest). All first-pass done.
5. Review: architecture-reviewer 0 CRITICAL / 0 HIGH / 1 MEDIUM / 3 LOW; plan-verifier PASS 68 / PARTIAL 2 /
   MISSING 0 / UNVERIFIED 1. Fix round fixed AC-20 (note wording) and AC-35 (runner error logging).
6. Live testing by the user surfaced four real problems (section 5), fixed or explained.
7. After live testing: workflow reduced to ONE job (fork-notice job removed), see section 6.

## 3. What was built (file map)

- shared contracts (both copies): `server/src/vendor/shared/contracts/eval-ci.ts`, `client/.../eval-ci.ts`;
  GitHub port additions in `server/src/vendor/shared/adapters.ts` (3 Actions reads + `getDefaultBranch`).
- server `server/src/modules/ci/`: `constants.ts`, `workflow.ts` (template + validator), `helpers.ts`,
  `repository.ts`, `service.ts` (preview/install/zip), `ingest.ts` + `ingest.service.ts` (pull ingest),
  `routes.ts`. Adapters: `adapters/github/octokit.ts`, `adapters/mocks.ts`. Schema `db/schema/ci.ts`,
  migration `db/migrations/0018_lush_plazm.sql`, dependency `yaml`.
- agent-runner: `src/{artifact,context,index,run}.ts` (artifact v2 fields, post-mode fallback, entry guard,
  redacted fatal log), README, one line in `scripts/dev.sh`.
- client: `lib/api.ts`, `lib/hooks/ci.ts`, `AgentEditor/_components/CiTab/**` (tab + 4-step wizard),
  `components/ci-runs-table/`, `app/ci-runs/**`, `vendor/ui/nav.ts` (GLOBAL → CI Runs), `messages/en/ci.json`.

## 4. Live evidence (what really happened on the demo repo)

PRs of `vzhut/conventions-demo` (`logs/github-prs.tsv`): #1 closed (first install PR), #2 merged (install), #3
closed (test, PR-comment mode), #4 merged (re-export), #5 open (test, review mode).

Runs (`logs/github-actions-runs.tsv`): install-PR runs succeed in ~4 s without a review (runner not on base yet);
test-PR runs finish `failure` because the gate tripped.

Real runner lines (`logs/ci-runner-step-excerpts.txt`):
- run 38530921493, PR #3, `DEVDIGEST_POST_AS: pr_comment`: `findings=2 blockers=2 gateTriggered=true posted=pr_comment`, exit 1.
- run 38531461473, PR #5, `DEVDIGEST_POST_AS: github_review`: same counts, `posted=github_review`, exit 1.
- env values print as `***`; a grep over all saved logs for `sk-or-`, `github_pat_`, `ghp_` found nothing.

Artifact (`logs/ci-artifact-run-38531461473.json`): `artifact_version 2`, repository + `repository_id`, `head_sha`,
2 critical, `blockers 2`, `verdict fail`, `cost_usd 0.0003`, `duration_ms 20244`, `manifest_version 19`, model
`deepseek/deepseek-v4-flash`, `runner_version "2"`, `node_version v22.23.3`. No secrets in it.

Studio DB (`logs/studio-db-snapshot.txt`): 4 `agent_runs` rows with `source='ci'`, all `pr_id` null; statuses
`skipped` (2 runs without artifact), `done` (PR #3: 2 findings, verdict fail; PR #4: pass); `run_traces` carry
`ci_run_key`, repo, PR number, verdict, job URL; `ci_installations`: 1 row, `active`, manifest v19, workflow v1.
The ingest path check `run.path === '.github/workflows/devdigest-review.yml'` accepted real runs, so the earlier
"unverified" risk that GitHub returns a ref suffix is retired. The newest run (38531461473) was not yet in the DB
when the snapshot was taken (ingest is pull-on-open/Refresh).

## 5. Problems found live, cause, and outcome

| # | Symptom | Cause (evidence) | Outcome |
|---|---|---|---|
| 1 | Install error "GitHub can't see this repository" on the user's own repo | Studio's `default_branch` is never synced from GitHub (schema default `main`); the repo's real branch is `master`; `getRef heads/main` → 404, which the code maps to `repo_not_accessible`. `check-token.sh` showed repo 200, `heads/main` 404, `default_branch = master`. | Fixed: `GitHubClient.getDefaultBranch` asks GitHub at install time (`service.ts`). The stored `default_branch` is still never synced elsewhere (not our scope). |
| 2 | The user's token check passed but studio still failed | The studio reads the token from `~/.devdigest/secrets.json` (Settings), which takes precedence over `server/.env`; `.env` had an empty `GITHUB_TOKEN=` (`adapters/secrets/local.ts`). | Documented; `check-token.sh` uses the same lookup order. |
| 3 | After the fix: "token lacks permission … Workflows write" | A fine-grained PAT needs Contents, Pull requests and **Workflows** write to push `.github/workflows/*`; read checks cannot reveal it. | User added the permission; install then worked. |
| 4 | No agent comment on the install PR | By design: workflow checks out the BASE sha; runner is not on base until the install PR is merged, so the job exits 0 with a summary notice. A mentor's reference run showed a review on the install PR because it checks out the PR head. | Kept base checkout (security); trade-off still open, see section 7. |
| 5 | Only a PR comment, not inline comments | Post mode was `pr_comment`. `github_review` posts summary + inline comments at diff lines (`reviewer-core/src/output/to-review.ts`). | Run 38531461473 used `github_review`. Suggestions are plain text, no ` ```suggestion ` blocks. |

Diagnostics added during the session: `githubDebugOf` in `modules/ci/helpers.ts`, logged with `ci install failed`
(method, path without query, GitHub message; never headers or token).

## 6. Change made after live testing (not yet re-exported)

`workflow.ts` now renders ONE job (`review`) with `if: head.repo.full_name == github.repository`; the
`fork-notice` job was removed (user request). The workflow on `master` of the demo repo is still the old two-job
one (`logs/generated-workflow-as-installed.yml`); it updates on the next "Add to CI" + merge. Server typecheck and
527 unit tests were green after the change. This deviates from AC-28 (no job-summary notice for forks).

## 7. Open items and decisions waiting

1. Runner layout: ship the whole ncc output like the mentor (`index.js` + lazy chunk `310.index.js` +
   `package.json`) instead of our single `index.mjs`? Our single file is unverified against the lazy chunk path.
   Waiting for the user.
2. Checkout BASE (current, no review on install PR) vs HEAD (mentor's, review on install PR but PR can alter the
   runner/manifest it runs under). Waiting for the user.
3. Nothing is committed. Needed before pushing: `/pr-self-review`; commit body must mention the sanctioned edit of
   `client/src/vendor/ui/nav.ts`.
4. No new tests exist for this feature (user rule). Suggested `test-writer` pass: `validateWorkflow`,
   `verifyArtifact` (forged repo id/SHA/path, oversize, replay), manifest/runner parity, artifact secret-leak.
5. Residual risks reported by review: zip-bomb bound relies on the 64 KiB zip cap; rejected artifacts are
   re-fetched each sync (30 runs/repo); dedupe relies on an in-process lock, not a DB constraint; "outdated"
   threshold duplicated in client and server; `editable: true` on non-workflow files in the contract;
   `routes.ts` reads the runner file itself.
6. Not verified anywhere: GitHub's handling of a skipped required check from a fork PR; behaviour on a Node
   older than 22.7 for the `.mjs` runner (only Node 24.11 locally, v22.23 in CI); `.it` tests; the browser UI by
   an automated check; artifact retention vs the 30-runs window.
7. Engineering insights not yet written to `INSIGHTS.md` (candidates): stored `default_branch` is never synced;
   secrets file beats `.env`; fine-grained PAT needs Workflows write and read probes hide it; `gh api
   .../git/ref/tags/<tag>` returns 404, use `matching-refs`; ncc output is ESM so a lone `index.js` needs Node
   ≥ 22.7 (recorded in `agent-runner/insights/INSIGHTS.md` already).

## 8. Questions worth analysing next

- Was the simple plan (6 tasks) the right cut, given four of five live problems were environment/permissions, not
  logic? Would a preflight (token scopes, default branch) in the wizard have removed them?
- Is pull-ingest acceptable UX (runs appear only when the studio is open)? Compare with a push endpoint.
- Should the wizard show which GitHub permission failed instead of one generic 403 message?
- Does `Fail CI on` need to live in the workflow/env instead of the manifest, so changing it does not require
  re-export?
- Agent budget: 12 spawns, ~1.82M tokens for the whole run; fix loop cost 175k for two one-line fixes. Which
  spawns were avoidable (see ledger proposals)?

## 9. Commands to reproduce state

```bash
cd <worktree>                                   # branch emdash/export-to-ci-tg8ip, HEAD 2d78769
git status --short; git diff --stat HEAD
cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'   # 527 tests
cd ../client && pnpm typecheck && pnpm test                                        # 467 tests
cd ../agent-runner && pnpm typecheck && pnpm test && pnpm build                    # 23 tests
bash docs/retro/2026-10-14-export-to-ci/check-token.sh vzhut/conventions-demo master
gh run list --repo vzhut/conventions-demo --limit 20
docker exec devdigest-postgres psql -U devdigest -d devdigest -c "select * from ci_installations;"
```

Local state to remember: studio on `:3001` / web `:3000` from this worktree; token in `~/.devdigest/secrets.json`;
the demo repo's default branch is `master`; branch `test/devdigest-critical` holds `src/insecureLookup.ts`
(deliberately insecure test fixture).

## 10. Test phase and final review (added 2026-10-14, after sections 1-9)

Three `test-writer` agents ran in parallel (one per package, disjoint paths, no production code touched), then the
parent re-ran every suite, then `architecture-reviewer` and `plan-verifier` ran again on the final tree.

| Package | Before | After | New files |
|---|---|---|---|
| server unit | 527 | 616 (89 new) | `server/test/ci-{workflow,ingest,helpers,service,ingest-service}.test.ts` |
| server integration | n/a | 7 (own testcontainers DB) | `server/test/ci.it.test.ts` |
| client | 467 | 573 (106 new) | 13 files next to the CI code, `lib/api.ci.test.ts`, `lib/hooks/ci.test.tsx` |
| agent-runner | 23 | 99 (76 new) | 7 files in `agent-runner/src/*.test.ts` |

Typecheck is clean in all packages; `agent-runner` build passes. The only red test in a full server run is the known
timing flake `test/project-docs-fs.test.ts` (3451 ms vs 2000 under load; 14/14 alone).

Final architecture review: CRITICAL 0, HIGH 0, MEDIUM 0 (the earlier "no tests" MEDIUM is gone), LOW 5. Earlier LOW-1..3
still stand (transaction inside `CiRepository.insertCiRun`; `routes.ts` reads the runner file and builds the repository
twice; outdated threshold duplicated in `CiTab/constants.ts` and `modules/ci/constants.ts`). New LOW: `CiTab.tsx:13`
imports `ConfigTab/constants` directly; unit tests cast a fake repo `as unknown as CiRepository`.

Final plan verification: PASS 66, PARTIAL 4, MISSING 0, UNVERIFIED 1 (71 items; AC-1..65 plus NFR and live-issue rows).
No functional AC is MISSING. AC-20 and AC-35 moved PARTIAL to PASS. About 58 of 65 ACs now cite a named passing test.
Remaining PARTIAL: AC-10 (server `editable: true` on non-workflow files), NFR security (no `.it` export-path token
sentinel check), NFR a11y (no manual keyboard walk), NFR observability (install success log lacks target/branch/outcome).
UNVERIFIED: NFR performance (no timing test).

Still weak by the verifier's own list: AC-8 has no cross-package manifest parity test; AC-3, 4, 29, 52, 59 are PASS by
reading only; AC-57 has no test reading PR-list cost after an ingest; routes (`app.inject`, zip headers) are untested;
`result_too_large` in `ingest.ts:65` looks unreachable (an oversized entry is dropped earlier as `result_file_missing`).

Test-writer notes worth knowing: `safeErrorText` in `agent-runner/src/index.ts` is not exported (tested through the
direct-entry path); `RunCiFailure.error` carries `err.message` unredacted and only `index.ts` redacts it; in the client
the PR radio stays enabled when the workflow has violations (only the Install button is disabled, zip stays available).

## 11. Cleanup round and final verification (added 2026-10-16)

After section 10 the user asked to fix the open items. Changes: `editable: false` for non-workflow files (AC-10); install/zip
success logs with target/branch/base/outcome; `current_workflow_version` on `CiInstallation` (both shared copies) replacing the
client constant; `CI_FAIL_ON_VALUES` moved to `AgentEditor/constants.ts`; `runner-bundle.ts` and one `CiRepository` in
`routes.ts`; narrow `CiExportRepo`/`CiIngestRepo` types so tests no longer cast. `insertCiRun` keeps its own transaction on
purpose (repositories in `skills/` and `eval/` do the same). Item 3 of the previous list (runner layout, base vs head
checkout) was skipped by the user: the runner stays a single `index.mjs` and the workflow still checks out BASE.

Final numbers: server 617 unit + 7 `.it`, client 573, agent-runner 99, typecheck clean. Incremental architecture review:
CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 0. plan-verifier: PASS 70 / PARTIAL 3 / MISSING 0 / UNVERIFIED 1 (74 items). Closed:
AC-10, NFR-Obs. Still open: AC-57 (no test reads PR-list cost after an ingest), NFR-Sec (no `.it` token-sentinel check on the
export path), NFR-A11y (no manual keyboard walk), NFR-Perf (no timing test). `getDefaultBranch` exists only in the server copy of
`shared/adapters.ts`; the client copy lags there on purpose (the client has no GitHub client).

Tails at this point: nothing is committed (31 tracked files modified, 26 untracked paths); the demo repo's workflow on `master`
is still the old two-job version until the agent is exported again and the PR merged; PR #5 and branch
`test/devdigest-critical` are still open in `vzhut/conventions-demo`; `/pr-self-review` has not been run.
