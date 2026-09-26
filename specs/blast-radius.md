# Blast Radius (L04 homework)

Status: **Initiation done, plan not written yet.** Branch `lesson-04-homework`. Deadline: **2026-09-27 23:45**.
Deliverable: an open PR in the fork (implementation description + which subagent did what) and a 1–3 min demo video.

## Goal

A reviewer looking at a diff cannot see what else the change can break. Blast Radius answers "what else can this diff touch?" from data that is **already computed**: `repo-intel` built the index at clone time; this feature only **reads** it — no re-parsing, no LLM in the main path.

The map shows three things:
1. which symbols are declared in the changed files;
2. who imports/calls those symbols;
3. which HTTP endpoints and crons can depend on the changed code.

Two deliverables:
- **UI:** a *Blast radius* block on the **Overview** tab of the PR page.
- **MCP:** a working `get_blast_radius` tool in `devdigest-mcp` (replaces the L04-lab stub) so Claude Code sees the same map without the UI.

## User stories

As a user I can:
1. Open a pull request and see a *Blast radius* block on the Overview tab.
2. See a summary on top: N symbols changed, N callers, N endpoints, N crons affected.
3. Under each changed symbol see its callers as `file:line`, and under them the endpoints/crons that depend on that symbol.
4. Click a `file:line` and land on that line in GitHub.
5. See a clear state when there are no callers, or when the repo index is incomplete.
6. Ask Claude Code for the PR's impact map and get the same answer as in the browser.

## Acceptance criteria

### P1 — block submission (must all be visible in the video)
- [ ] P1.1 Overview tab of the PR page has a *Blast radius* block.
- [ ] P1.2 Top summary: symbols changed, callers, endpoints, crons affected.
- [ ] P1.3 Under each changed symbol: callers as `file:line`; under them: the endpoints that depend on the symbol.
- [ ] P1.4 On a test PR that changes a shared helper the map shows **≥ 2 real callers** and **≥ 1 HTTP endpoint**.
- [ ] P1.5 Click on `file:line` opens exactly that line in GitHub.
- [ ] P1.6 No callers → readable text instead of an empty screen. Incomplete index → a separate marker **with the reason**.
- [ ] P1.7 `devdigest-mcp` has a working `get_blast_radius` (not the stub); for a request in Claude Code it returns the same map as the page. Implementation may be as simple as calling our route.
- [ ] P1.8 Open PR with implementation description and demo video.

### P2 — not blocking, mentor comments in the PR
- [ ] P2.1 Logs show reading the ready index, not re-parsing: AST and import graph are not rebuilt.
- [ ] P2.2 Route response is validated by the `BlastRadius` contract.
- [ ] P2.3 The flat-`callers` → grouped-`downstream` mapping is covered by a unit test.
- [ ] P2.4 The main path makes no LLM call. (If an optional text summary is added: exactly one call, and the feature works without it.)
- [ ] P2.5 The file where a symbol is declared never appears among that symbol's callers.
- [ ] P2.6 Limits (20 callers per symbol, depth 2) come from `constants.ts`, not hard-coded in a component.
- [ ] P2.7 `degraded` and `reason` from the facade reach the UI, not lost on the server.
- [ ] P2.8 `get_blast_radius` follows the lab rules: short description, when to call it, clear argument schema, compact response, useful error for an unknown PR, `readOnlyHint: true`.
- [ ] P2.9 PR description says which subagent did what.

### P3 — nice to have
- [ ] P3.1 Symbols collapse/expand like the tree in the mock.
- [ ] P3.2 Second view: graph, with a Tree / Graph switch (keys `view.tree`, `view.graph` exist).
- [ ] P3.3 "Prior PRs touching these files" block. Zod `PrHistory` exists in `brief.ts`; **no data source exists in the starter** — must be fetched from GitHub.
- [ ] P3.4 Crons shown separately from HTTP endpoints.
- [ ] P3.5 Symbols sorted by `rank` (most important on top).
- [ ] P3.6 Next to the incomplete-index marker, a button calling `POST /repos/:id/resync`.
- [ ] P3.7 UI labels come from `client/messages/en/blast.json`, not hard-coded (same as `prReview.json` on Files changed).

## Suggested implementation (from the assignment)

1. **Server module** `server/src/modules/blast/`, route `GET /pulls/:id/blast`. Takes the PR's changed files, calls `repoIntel.getBlastRadius(repoId, changedFiles)` **once**, maps the result to the `BlastRadius` contract.
2. **Mapping.** Group flat `callers` by `viaSymbol` → `downstream`. Per group collect endpoints/crons from `factsByFile` by the group's caller files. `summary` is a string built from numbers, no model.
3. **Honest degradation.** If the facade returns `degraded: true`, pass it and the reason through so the UI shows a state, not an empty map.
4. **Overview block**, new client hook; start with summary + a simple list with links; tree and graph optional.
5. **MCP.** Replace the stub with a call to the same `GET /pulls/:id/blast`. Nothing new is computed; the tool returns the route's answer. `readOnlyHint: true`.
6. **Build through the L03 pipeline:** planner → implementer → (architecture-reviewer ∥ plan-verifier). The PR description states which subagent did what.

## How to verify (= the video script)

1. Open the test PR → Overview → Blast radius → show the summary (symbols, callers, endpoints, crons).
2. Show a changed symbol's callers as `file:line` and the endpoints under them.
3. Open one or two callers in code: they really use the changed function, not its own dependencies.
4. Click `file:line` → that line opens in GitHub.
5. Show the no-callers state and the incomplete-index state.
6. In Claude Code ask for the impact map of the same PR → answer matches the block.
7. One sentence: why the map calls no model and re-parses nothing.

**Test PR.** Any PR that changes an exported function imported by ≥ 2 other files. If reviewing DevDigest itself: something from `server/src/modules/reviews/helpers.ts` or `client/src/components/diff-viewer/helpers.ts`.
**Before the run:** `curl http://localhost:3001/repos/<repoId>/index-state` must return `status: full` (`repoId` is in the URL `/repos/<repoId>/pulls/<n>`). `partial`/`degraded` is a valid separate demo scenario.

## What already exists (verified in code, 2026-09-26)

| Piece | Where | Note |
|---|---|---|
| Facade `getBlastRadius(repoId, changedFiles)` → `BlastResult` | `server/src/modules/repo-intel/service.ts:220` (persistent path `tryPersistentBlast` :315) | `changedSymbols`, flat `callers{file,symbol,viaSymbol,line,rank}`, `impactedEndpoints`, `factsByFile?`, `degraded?`, `reason?`. Never throws. |
| Facade types | `server/src/modules/repo-intel/types.ts:53-84` | `DegradedReason`: `flag_off / index_failed / index_partial / repo_too_large / no_data` |
| Limits | `repo-intel/constants.ts` `MAX_CALLERS_PER_SYMBOL = 20`, `BFS_DEPTH = 2` | |
| Contract `BlastRadius` | `server/src/vendor/shared/contracts/brief.ts:48-76` | `changed_symbols[]`, `downstream[{symbol, callers[{name,file,line}], endpoints_affected[], crons_affected[]}]`, `summary`. Client copy is byte-identical (`diff` clean). |
| Index state / resync | `repo-intel/routes.ts` `GET /repos/:id/index-state`, `POST /repos/:id/resync`; client hooks `useRepoIntelStatus`, `useResyncRepoIntel` in `client/src/lib/hooks/repo-intel.ts` | resync hook already exists (P3.6 is nearly free) |
| GitHub deep-link | `client/src/lib/github-urls.ts` `githubBlobUrl(repo, sha, file, startLine)` | |
| i18n | `client/messages/en/blast.json` | keys: `stat.{symbols,callers,endpoints,crons}`, `view.{tree,graph}`, `callerCount`, `noDownstream`, `graph.{empty,ariaLabel}` |
| Overview tab | `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` | renders `IntentCard` + PR body only |
| MCP stub | `mcp-server/src/tools/get-blast-radius.ts`, registry entry in `tools/index.ts`, args shape `contracts.ts:73`, output type `BlastRadiusResult` `contracts.ts:186` | stub always returns `isError` |
| MCP stub test | `mcp-server/test/tools-get-blast-radius.test.ts` | asserts the stub behaviour — must be rewritten |
| Module registry | `server/src/modules/index.ts` (static) | add `blast` here |
| `PrDetail.files` / `head_sha` | `GET /pulls/:id` (`pulls/routes.ts:~195`), persisted in `pr_files` | source of the PR's changed files |

## What is missing (our work)

- `server/src/modules/blast/` (routes, service, mapping helper) + registration in `modules/index.ts`; no `blast` code exists outside vendor/repo-intel.
- Client hook (e.g. `useBlastRadius` in `client/src/lib/hooks/`), the block component under `OverviewTab/_components/`, extra `blast.json` keys (title, no-callers wording, incomplete-index + reason texts, resync button).
- MCP: real handler, `api/client.ts` method + `api/schemas.ts` parser for the route, formatter (compact output, cap, `callers_total`, `where`), rewritten tests, docs.
- Tests: mapping unit test; route test with mock `RepoIntel` (container accepts `repoIntel` override); client component test; MCP tool test; e2e flow (optional).

## Traps found during Initiation (read before planning)

1. **Facade caps callers in total, not per symbol.** `tryPersistentBlast` does `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` on the global rank-sorted list (`service.ts` ~:388). With several changed symbols a busy symbol can starve the others; the assignment text says "20 per symbol". Decide: apply the per-symbol cap in the blast mapper (importing `MAX_CALLERS_PER_SYMBOL`, P2.6) and/or fix the facade — but the facade already truncated, so the mapper alone cannot recover the lost rows.
2. **`partial` index is not reported as degraded.** For `status: partial` the persistent path returns `degraded: false` (no `index_partial` reason). The "incomplete index" marker (P1.6) therefore needs `getIndexState` in addition to `BlastResult.degraded/reason` — the facade result alone will not show it.
3. **The wire contract has no place for `degraded`/`reason`.** `BlastRadius` = `{changed_symbols, downstream, summary}`. P2.7 requires passing them through → extend the contract with optional fields (mirrored into **both** `vendor/shared` copies — do-not-touch rule: deliberate contract change only) or wrap the route response. `PrBrief.blast` reuses `BlastRadius`, so optional additions are safer than required ones.
4. **Ripgrep fallback path differs.** When the persistent index is unusable the facade returns `degraded: true, reason: 'no_data'`, `rank: 0`, **no `factsByFile`** and a flat `impactedEndpoints`. Endpoints/crons cannot be attributed per symbol there — the mapper must not invent attribution (empty per-symbol lists + top-level state, or attribute nothing).
5. **Index snapshot ≠ PR head.** The index is built from the clone's last indexed SHA (`state.lastIndexedSha`), not the PR head. New/renamed files in the PR have no symbols in the index; caller line numbers refer to the indexed SHA. This affects which `sha` goes into `githubBlobUrl` (callers are outside the diff; the line must exist at that sha) — see open decision D2.
6. **"Changed symbols" = every symbol declared in a changed file**, not only edited ones (the facade has no hunk-level info; the last mock shows "14 symbols, 6 callers"). Decide whether symbols with zero callers are listed (D3).
7. **MCP text is frozen by spec.** Descriptions/titles are verbatim in `specs/devdigest-mcp.md` § "Tool descriptions (verbatim)" and `tools-list.test.ts` asserts exact equality; the current title is "Get PR blast radius (not implemented)". Change the spec **first**, then registry + test. Constraints: description ≤ 200 chars, whole `tools/list` ≤ 6,000 chars, default response ≤ 10,000 chars (`response-size.test.ts`), flat scalar args. Also update `docs/devdigest-mcp.md` (rows at :58, :88, § "Homework hook"), `mcp-server/AGENTS.md`/README "(stub)" mentions, `SERVER_INSTRUCTIONS` if the tool set wording changes.
8. **MCP contract is its own type.** `BlastRadiusResult` (`contracts.ts:186`) = `{status:"ok", repo, pr, summary, changed_symbols, downstream:[{symbol, callers_total, callers:[{name, where}], endpoints_affected, crons_affected}], shown, total, hint?}`; `limit` 1–50 default 20, downstream ordered by `callers_total` desc. The MCP package must NOT import from `server/`/vendor/shared — it needs its own parser in `api/schemas.ts`. "Same map as the page" means same data, not same JSON shape.
9. **Never return empty as "zero impact" for a degraded map** (the stub's principle, `get-blast-radius.ts:1-6`): degraded/incomplete must be explicit in the MCP output too.
10. **Stale copies:** `.claude/worktrees/agent-*` contain older repo copies that pollute `grep -r`; ignore them.
11. **Client contract copy** "already lags the server" — here `brief.ts` is identical, so mirror the change exactly; don't sync other files.
12. **i18n:** confirm how namespaces are loaded (does `blast.json` need registering anywhere, or is it auto-included?) before relying on it.
13. **Workflow gates:** migrations not needed (no schema change expected); `pr-self-review` is manual before push; record insights in the right `INSIGHTS.md` unprompted; append a Delivery log to this spec at the end.

## Decisions (agreed 2026-09-26)

- **D1 Contract:** extend `BlastRadius` with optional `degraded` / `reason` / index status; mirror into BOTH `vendor/shared` copies (identical today).
- **D2 GitHub link sha:** `lastIndexedSha` (line numbers come from the index).
- **D3 Symbols without callers:** hidden; the summary counts only symbols with downstream impact.
- **D4 Scope:** P1 + all of P2 + cheap P3 (crons separate, rank sort, resync button, `blast.json` labels, collapsing tree) **+ Graph view + Prior PRs — all in the mandatory plan** (no cut-off). Order inside the plan: P1 → P2 → cheap P3 → Graph → Prior PRs, so a time squeeze drops the tail, not the core.
- **D5 LLM summary:** none; `summary` is a string built from numbers.
- **D6 Demo data:** create our own demo PR (see below) rather than hunt for one.

### D6 detail — demo PR
PRs are imported from GitHub, so the demo PR must exist on the fork. It should (a) change an exported helper imported by ≥ 2 files, one of them reachable from an HTTP endpoint, (b) leave a second PR/state for the no-callers case and use `index-state` `partial`/`degraded` (or the feature flag off) for the incomplete-index case. Creating the branch/PR on GitHub is an outward-facing action — confirm remote/fork before doing it.

## Still open
- Which fork remote / which exact helper for the demo PR (check `git remote -v`, pick from `server/src/modules/reviews/helpers.ts`).
- Prior PRs data source: GitHub API (PRs touching the same files) — endpoint and caching to be decided in the plan (`PrHistory` in `brief.ts`, no data yet).

## Plan

Development Plan + task cards: [`blast-radius.tasks.md`](blast-radius.tasks.md) — 19 tasks (T0–T18) in 9 phases, ordered P1 core → remaining P2 → cheap P3 → Graph → Prior PRs → validation, so a time squeeze drops the tail, not the core.
Server `modules/blast/` reads the `repo-intel` index once (facade fixed to cap callers per symbol), the Overview card shows the map with degraded/incomplete states, and MCP `get_blast_radius` calls the same route. Open decisions OD1–OD6, OD8 have recommended defaults.

## Delivery log

_Filled at completion (one entry per phase: commits, tests/e2e, review outcomes, PR link, video link)._
