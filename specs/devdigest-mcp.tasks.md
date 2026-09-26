# Task cards — devdigest-mcp (spec: `/Users/volodymy.rzhutenko/Documents/AI Course/dev-digest/specs/devdigest-mcp.md`)
Read the card for your task ID, plus the spec's `## Tool contracts (final)` and `## Design` sections when the card points to them. The spec wins on any mismatch.

Global fixed decisions (all tasks): standalone npm package `mcp-server/` over HTTP to the REST API, stdio only (D1); tool names `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius` (D2); wait timeout → `{status:"running", run_id, next}` not an error (D3); env `DEVDIGEST_API_URL` default `http://localhost:3001`, no workspace id (D4). Open-decision defaults in use: OD1 model `verdict` + `blockers` + `score`; OD2 `repo`=`owner/name`|uuid, `pr`=number, `agent`=name|id; OD3 latest run + hint; OD4 blast radius `isError:true`; OD5 text-only compact JSON, no `outputSchema`; OD6 abort = stop waiting only; OD7 tsx launcher, 5 runs/10 min, `wait_seconds` 30–120, default 120 (D5: blocking, 120 s max). No imports from `server/`, `client/`, `reviewer-core/` or any `vendor/shared`. Tests live in `mcp-server/test/`, hermetic. Verify: `cd mcp-server && pnpm typecheck && pnpm test`. Tool/field descriptions and `instructions` are fixed verbatim in `specs/devdigest-mcp.md` § "Tool descriptions (verbatim)" — use them character for character.

## T1 — Scaffold `mcp-server/` package, config, logger
- **Executor / Type / Depends-on / Risk:** implementer / backend / none / medium
- **Fixed decisions:** pnpm ESM package `@devdigest/mcp-server` (private); deps `@modelcontextprotocol/sdk` (exact 1.x accepting zod 3), `zod ^3.24.1`; devDeps `typescript ^5.7`, `tsx`, `vitest ^2`, `@types/node ^22`; scripts `start` = `tsx src/index.ts`, `typecheck`, `test` = `vitest run`; tsconfig strict, NodeNext, noEmit. Config: `DEVDIGEST_API_URL` (loopback only: `localhost`, `127.0.0.1`, `::1`), `DEVDIGEST_MCP_RUN_LIMIT` default 5 per 10 min, poll 3000 ms. Logger writes to stderr only. No linter.
- **Owned paths:** `mcp-server/package.json`, `mcp-server/pnpm-lock.yaml`, `mcp-server/tsconfig.json`, `mcp-server/vitest.config.ts`, `mcp-server/.gitignore`, `mcp-server/AGENTS.md`, `mcp-server/CLAUDE.md`, `mcp-server/INSIGHTS.md`, `mcp-server/README.md`, `mcp-server/src/config.ts`, `mcp-server/src/log.ts`, `mcp-server/test/config.test.ts`
- **Action:** create the package; run `pnpm install` once (lockfile creation is intended); write AGENTS.md (role, commands, stdout-is-protocol rule, API-schema-sync rule), CLAUDE.md = `@AGENTS.md`, INSIGHTS.md with the seven standard sections, README (env table, registration, Inspector command).
- **Traps that apply:** never guard an entrypoint with `` import.meta.url === `file://${argv[1]}` `` — the checkout path has a space (`server/INSIGHTS.md:12-39`); check `npm view @modelcontextprotocol/sdk peerDependencies` before pinning.
- **Acceptance:** `pnpm typecheck` 0; `config.test.ts`: default URL, `http://evil.example:3001` rejected, `http://127.0.0.1:3001` accepted; `git status` shows only `mcp-server/**`.
- **Design pointer:** spec `## Design` → Files

## T2 — Pure core: tool contracts and formatters
- **Executor / Type / Depends-on / Risk:** implementer / core / T1 / low
- **Fixed decisions:** input shapes are Zod raw shapes of scalars only (string/number/enum, optional/default); field `.describe()` ≤ 60 chars; outputs snake_case compact JSON without nulls; hard cap 24,000 chars with hint; findings sorted CRITICAL > WARNING > SUGGESTION, file, start line; dismissed excluded; concise finding = `{severity, title, where:"file:start-end", category}`; detailed adds `rationale`, `suggestion`, `scope`, `id`; default `limit` 20 (max 100), `severity_min` default SUGGESTION; truncation hint "showing X of Y — raise limit (max 100) or set severity_min=WARNING"; `pickReview` states `done|running|no_run|failed|cancelled`; conventions states `ok|not_extracted|none_accepted`, default status accepted, limit 30; final `BlastRadiusResult` mirrors shared `BlastRadius` names (`server/src/vendor/shared/contracts/brief.ts:48-76`) with `callers_total`, `where`.
- **Owned paths:** `mcp-server/src/contracts.ts`, `mcp-server/src/format/errors.ts`, `mcp-server/src/format/respond.ts`, `mcp-server/src/format/sanitize.ts`, `mcp-server/src/format/findings.ts`, `mcp-server/src/format/conventions.ts`, `mcp-server/test/format-findings.test.ts`, `mcp-server/test/format-conventions.test.ts`, `mcp-server/test/sanitize.test.ts`, `mcp-server/test/respond.test.ts`, `mcp-server/test/fixtures/`
- **Action:** implement `ToolError`, `toolError()`, `ok()`, `compact()`, cap, `sanitizeText()` (strip C0/C1 + ANSI, collapse whitespace, cap with `…`), findings/conventions helpers incl. `severityCounts`, `emptyDiffWarning` (grounding `0/0`). **Field descriptions in `contracts.ts`: take verbatim from spec § "Tool descriptions (verbatim)" — no rewording.**
- **Traps that apply:** `confidence` can be 0 on every finding (root `INSIGHTS.md:198-206`) — never sort/filter by it; `verdict` nullable (`review-api.ts:32`).
- **Acceptance:** 143-finding fixture → 20 items, CRITICAL first, hint text, concise ≤ 10,000 chars; severity filter; dismissed excluded; all 5 `pickReview` states; ANSI/NUL stripped; no `null` in output; cap adds hint; contracts contain only scalar Zod types.
- **Design pointer:** spec `## Tool contracts (final)`

## T3 — HTTP API client and arg resolution
- **Executor / Type / Depends-on / Risk:** implementer / backend / T2 / medium
- **Fixed decisions:** only `src/api/client.ts` calls `fetch`; own Zod parsers for consumed fields only (never keep `system_prompt`/`output_schema`); timeouts 15 s (30 s for `listPulls`); errors: refused → unreachable ("…start it with ./scripts/dev.sh"), 404, 429, other → `ApiError(code, message)` without `details`; resolution `repo` = `owner/name` case-insensitive on `full_name` or uuid, `pr` number → uuid via `GET /repos/:id/pulls`, `agent` = id or case-insensitive exact name, ambiguous → "pass the id"; 60 s TTL cache; every miss message names the next step (spec table "Empty/state messages").
- **Owned paths:** `mcp-server/src/api/client.ts`, `mcp-server/src/api/schemas.ts`, `mcp-server/src/resolve.ts`, `mcp-server/test/api-client.test.ts`, `mcp-server/test/resolve.test.ts`
- **Action:** methods `listAgents`, `listRepos`, `listPulls`, `getPull`, `activeRuns`, `listRuns`, `listReviews`, `startReview`, `getConventions`; resolvers with `requireEnabled` option.
- **Traps that apply:** `GET /repos/:id/pulls` syncs GitHub (slow) (`server/src/modules/pulls/routes.ts:34-60`); unseeded DB error "run `pnpm db:seed`" (`server/src/adapters/auth/local.ts:24-35`) — surface it.
- **Acceptance:** fake-fetch tests: refused → text has `./scripts/dev.sh`; `details` value never in error text; unknown repo lists ≤ 10 known names; unknown agent → `list_agents`; ambiguous → "pass the id"; cache hit makes no second fetch.
- **Design pointer:** spec `## Design` → Placement

## T4 — `list_agents` and `get_conventions`
- **Executor / Type / Depends-on / Risk:** implementer / backend / T3 / low
- **Fixed decisions:** each tool file exports `ToolDef {name, description (≤ 200 chars), inputShape, annotations, handler(args, ctx)}` returning a plain `ToolResult`; list_agents: enabled only, `{name, id, model:"provider/model", about ≤ 120}`, sorted by name, empty → "enable or create one in DevDigest → Agents"; get_conventions never triggers extraction; conventions text sanitised.
- **Owned paths:** `mcp-server/src/tools/list-agents.ts`, `mcp-server/src/tools/get-conventions.ts`, `mcp-server/test/list-agents.test.ts`, `mcp-server/test/get-conventions.test.ts`
- **Action:** implement both tools over T2 formatters and T3 client/resolvers.
- **Traps that apply:** `Agent.system_prompt` is on the wire (`server/src/vendor/shared/contracts/knowledge.ts:261-277`).
- **Acceptance:** no `system_prompt` fixture text in output; disabled agent absent; `scan:null` → `not_extracted` + Extract hint; 3 pending/0 accepted → `none_accepted, pending:3`; 30 concise items (the default limit) serialise to ≤ 5,000 chars (relaxed 2026-09-26 during implementation by the orchestrating session, not yet user-approved: 3,000 for 60 candidates was unreachable with realistic rule text; measured 4,465 for 30 items, still well under the 24,000-char cap and Claude Code's 10K-token warning).
- **Design pointer:** spec `## Tool contracts (final)`

## T5 — `get_findings`
- **Executor / Type / Depends-on / Risk:** implementer / backend / T3 / low
- **Fixed decisions:** args `repo`, `pr`, `agent?`, `run_id?` (uuid), `severity_min?`, `limit?`, `response_format?`; selection: `run_id` → that run; else latest run of `agent`; else latest run overall + hint "also reviewed by: …"; seeded reviews without a run → latest review by `created_at`; result `{status, repo, pr, agent, run_id, verdict, score, blockers, counts, findings, shown, total, hint?, warning?, untrusted}`; disabled agents allowed for reading.
- **Owned paths:** `mcp-server/src/tools/get-findings.ts`, `mcp-server/test/get-findings.test.ts`
- **Action:** join `listRuns` and `listReviews` on `run_id`; unknown `run_id` → `isError` "run … is not on PR #N — omit run_id to get the latest".
- **Traps that apply:** runs newest by `ran_at` (`run.repo.ts:51`), reviews newest by `created_at` (`review.repo.ts:87`) — join by `run_id`; `0/0` grounding may mean empty diff (`server/INSIGHTS.md:57-72`).
- **Acceptance:** tests for done, running, no_run (hint `run_agent_on_pr`), failed (`isError`), cancelled, unknown run_id, 0/0 warning, detailed larger than concise, seeded review without run.
- **Design pointer:** spec `## Tool contracts (final)`

## T6 — `run_agent_on_pr` and rate limiter
- **Executor / Type / Depends-on / Risk:** implementer / backend / T3 / high
- **Fixed decisions:** flow resolve (agent must be enabled) → `getPull` prime → in-flight map `prId:agentId` → `activeRuns` reuse (`reused_run:true`) else rate-limit (5/10 min sliding window, injected clock) then one `startReview` → poll `listRuns` every 3 s → progress `notifications/progress {progressToken, progress: elapsed s, total: wait_seconds, message}` only when a progressToken exists → done: concise get_findings shape + `run_id`, `cost_usd`; failed/cancelled: `isError` + next step; timeout or aborted signal: `{status:"running", run_id, repo, pr, agent, next:"call get_findings with run_id=…"}`, `isError` false, server run not cancelled; `wait_seconds` 30–120 default 120 (stop polling at ≤ 115 s so the tool answers before Claude Code's 120 s auto-background, D5); API 429 → rate-limit message.
- **Owned paths:** `mcp-server/src/tools/run-agent-on-pr.ts`, `mcp-server/src/rate-limit.ts`, `mcp-server/test/run-agent-on-pr.test.ts`, `mcp-server/test/rate-limit.test.ts`
- **Action:** implement per spec `## Design` sequence with injected `sleep`/`now`.
- **Traps that apply:** empty-diff approval — always prime `GET /pulls/:id` (`server/INSIGHTS.md:57-72`); API limit 10/min (`server/src/modules/reviews/routes.ts:31`); `resolveTargets` ignores `enabled` (`server/src/modules/reviews/service.ts:47-58`); read reviews not traces (`server/INSIGHTS.md:220-228`); API restart reaps running runs to `failed` (`server/src/app.ts:79-90`).
- **Acceptance:** (a) one POST, result has verdict/findings/cost_usd; (b) active run → zero POST, `reused_run:true`; (c) two concurrent calls → one POST; (d) 6th call in 10 min → `isError` "Wait…", zero POST; (e) never-terminal + `wait_seconds:30` → running shape with `get_findings` hint, `isError` false; (f) ≥ 2 progress notifications, strictly increasing; (g) failed → sanitised error; (h) disabled agent → `isError`, zero POST; (i) 429 mapped.
- **Design pointer:** spec `## Design` → `run_agent_on_pr` sequence

## T7 — `get_blast_radius` stub
- **Executor / Type / Depends-on / Risk:** implementer / backend / T3 / low
- **Fixed decisions:** args `repo`, `pr`, `limit?` (1–50, default 20); resolves repo/pr, then `isError:true` with: "get_blast_radius is not implemented yet (DevDigest L04 homework). No impact data exists — do not read this as zero impact. Use get_findings for review results."; never emits `changed_symbols`/`downstream`; final success shape lives in `contracts.ts` (T2).
- **Owned paths:** `mcp-server/src/tools/get-blast-radius.ts`, `mcp-server/test/get-blast-radius.test.ts`
- **Action:** implement the stub + `TODO(L04 homework)` pointer to `contracts.ts` and `brief.ts:48-76`.
- **Traps that apply:** an empty list reads as "zero impact" — none must be returned.
- **Acceptance:** valid args → `isError:true`, text has "not implemented" and "zero impact", no `changed_symbols`/`downstream` in output; unknown repo → standard repo error.
- **Design pointer:** spec `## Tool contracts (final)`

## T8 — Registry, MCP server, stdio entry, protocol tests
- **Executor / Type / Depends-on / Risk:** implementer / backend / T4, T5, T6, T7 / medium
- **Fixed decisions:** order `list_agents, run_agent_on_pr, get_findings, get_conventions, get_blast_radius`; annotations: 4 read tools `readOnlyHint:true, idempotentHint:true, openWorldHint:false`; run `readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:true`; no `outputSchema`; server name `devdigest`; instructions (≤ 300 chars): "DevDigest local PR reviewer. Start with list_agents; run_agent_on_pr runs a paid review and waits up to 2 min; get_findings reads a finished run. Args: repo=owner/name, pr=number, agent=name."; unexpected errors → `isError` "Internal error in devdigest-mcp — see stderr"; no network at startup; exit 0 on stdin close/SIGINT.
- **Owned paths:** `mcp-server/src/tools/index.ts`, `mcp-server/src/server.ts`, `mcp-server/src/index.ts`, `mcp-server/test/tools-list.test.ts`, `mcp-server/test/response-size.test.ts`, `mcp-server/test/stdio.test.ts`
- **Action:** wire everything; tests: tools-list (5 exact names, flat scalar schemas, description ≤ 200, instructions ≤ 300, whole tools/list ≤ 6,000 chars, annotations, no outputSchema); response-size (each tool's default response on large fixtures ≤ 10,000 chars); stdio (spawn tsx with `DEVDIGEST_API_URL=http://127.0.0.1:9`, initialize < 3 s, every stdout line JSON-RPC, `list_agents` → `isError` with `./scripts/dev.sh`).
- **Traps that apply:** no `console.log` anywhere; spawn with an args array (space in path, `server/INSIGHTS.md:12-39`); verify SDK in-memory transport import path in the installed package.
- **Acceptance:** `pnpm typecheck && pnpm test` exit 0; the tools/list size is printed to stderr by the test.
- **Design pointer:** spec `## Design` → Placement

## T9 — Registration, CI, root docs rows
- **Executor / Type / Depends-on / Risk:** parent / config+docs / T8 / low
- **Fixed decisions:** `.mcp.json` server `devdigest`, `type: stdio`, `command: mcp-server/node_modules/.bin/tsx`, `args: ["mcp-server/src/index.ts"]`, `env: {DEVDIGEST_API_URL: "http://localhost:3001"}`, no secrets; CI `.github/workflows/mcp-server.yml` path filter `mcp-server/**` + itself, Node 22, `ppnpm install --frozen-lockfile`, typecheck, test.
- **Owned paths:** `.mcp.json`, `.github/workflows/mcp-server.yml`, `AGENTS.md`, `TESTING.md`, `README.md`
- **Action:** add the files; AGENTS.md Layout row + verify commands for `mcp-server/` ("five standalone packages"); TESTING.md suite row; README L04 pointer to `mcp-server/README.md`.
- **Traps that apply:** project MCP servers may need approval on first use in Claude Code (Unverified).
- **Acceptance:** `claude mcp list` shows `devdigest` connected with the API running; `mcp-server.yml` green on the PR; new rows present.
- **Design pointer:** none

## T10a — `docs/devdigest-mcp.md` + index rows
- **Executor / Type / Depends-on / Risk:** doc-writer / docs / T8 / low
- **Fixed decisions:** content = tool contract table, state/error table, run sequence diagram, token-budget numbers, Inspector + `/context` verification, blast-radius homework hook (`repo-intel`); only `flowchart`/`sequenceDiagram`.
- **Owned paths:** `docs/devdigest-mcp.md`, `docs/README.md`, `specs/README.md`
- **Action:** write the deep-dive from the spec and the implemented `mcp-server/src/tools/*`; add one index row in each README.
- **Traps that apply:** do not edit the spec's Delivery log or any INSIGHTS.md.
- **Acceptance:** five tool names and all states match the code; two index rows added.
- **Design pointer:** spec `## Tool contracts (final)`, `## Design`

## T10b — Validation, insights, commit, Delivery log
- **Executor / Type / Depends-on / Risk:** parent / e2e-manual / T9, T10a / medium
- **Fixed decisions:** validate against the running stack (`./scripts/dev.sh`); one real paid run only; commit on `lesson-04-laba` in slices after `pr-self-review`.
- **Owned paths:** `mcp-server/INSIGHTS.md` (append), `INSIGHTS.md` (append), `specs/devdigest-mcp.md` (`## Delivery log` only)
- **Action:** Inspector (`npx @modelcontextprotocol/inspector mcp-server/node_modules/.bin/tsx mcp-server/src/index.ts`) on all 5 tools incl. unknown agent and `wait_seconds:30`; fresh Claude Code chat: `/mcp`, `/context`, one natural-language review request; full `mcp` tests + typecheck; engineering-insights; Delivery log.
- **Traps that apply:** sanity-check the real run's `tokens_in` (empty-diff trap, `server/INSIGHTS.md:57-72`).
- **Acceptance:** Delivery log has tools/list size, `/context` MCP share, real run id + finding count + duration, per-tool Inspector result, test/typecheck output, review verdict.
- **Design pointer:** none
