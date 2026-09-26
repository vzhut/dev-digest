# mcp — insights

Findings that cost real debugging time. Append new entries; don't rewrite old ones.
Cross-package findings belong in the root `INSIGHTS.md`.

## What Works

_No entries yet._

## What Doesn't Work

_No entries yet._

## Codebase Patterns

### `run_agent_on_pr` guard state is an explicit `ToolDeps.runGuard`, not a module-level WeakMap

`src/deps.ts:12`, `src/run-guard.ts:1`, `src/index.ts:41` · 2026-09-26

The rate limiter (5 runs / 10 min) and the in-flight map (`prId:agentId`, which makes two concurrent identical calls share one paid run) used to sit in a `WeakMap<ToolDeps, State>` in `run-agent-on-pr.ts`, so `{...deps}` or a second deps object silently got a fresh limiter and disabled both guards. Design change: `createRunGuard()` builds them once in the composition root and they travel as `deps.runGuard`; the WeakMap is gone. Tests that build deps by hand use `testRunGuard()` (`test/helpers/run-guard.ts`); a copied deps object now shares the same guard.

### The API reaper marks stale runs `failed` without an error message

`server/src/modules/reviews/repository/run.repo.ts:123` · 2026-09-26

`reapStaleRunningRuns` only does `SET status = 'failed'` for runs left `running` at boot; it writes no `error`. A failed run with an empty `error` therefore usually means the API restarted mid-run, not a model failure. `failedMessage` in `src/format/messages.ts` (shared by both tools) handles this by saying "no error recorded — the DevDigest API may have restarted mid-run" instead of blaming the model or key.

## Tool & Library Notes

### `@modelcontextprotocol/sdk` needs zod `^3.25`, not the repo's usual `^3.24.1`

`package.json:12-13` · 2026-09-26

`npm view @modelcontextprotocol/sdk@1.30.1 peerDependencies` gives `zod: ^3.25 || ^4.0`, so the `^3.24.1` range the other packages use is too low for it (a lockfile pinned to 3.24.x would break the peer). `mcp-server/` therefore declares `zod ^3.25.0` (installed 3.25.76) and pins the SDK exactly (`1.30.1`). `registerTool` accepts Zod 3 raw shapes (`ZodRawShapeCompat`, `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts:150`); the in-memory transport is importable as `@modelcontextprotocol/sdk/inMemory.js` (`exports` `./*` wildcard).

## Recurring Errors & Fixes

### `registerTool` handler result type rejects the plain `ToolResult` interface

`src/server.ts:26` · 2026-09-26

`TS2345 ... Index signature for type 'string' is missing in type 'ToolResult'`: the SDK's `CallToolResult` has a string index signature, which an `interface` (unlike an object literal) does not satisfy, and spreading it does not help either. `toCallToolResult()` in `src/server.ts` rebuilds `{content, isError?}` explicitly, keeping the handlers SDK-free.

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
