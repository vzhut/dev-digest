# mcp-server (`@devdigest/mcp-server`)

Local-only MCP server (stdio) that lets a coding agent drive DevDigest: list reviewer agents, run one on a PR, read findings and conventions, (stub) blast radius. It is a thin adapter over the DevDigest REST API on `:3001`; it has no DB, no GitHub token and no LLM key. Spec: `specs/devdigest-mcp.md`.

## Before answering
Search `mcp-server/INSIGHTS.md`, `docs/devdigest-mcp.md` and `specs/devdigest-mcp.md` first.

## Commands
| What | Command |
|---|---|
| Install | `pnpm install` (pnpm, own lockfile) |
| Typecheck | `pnpm typecheck` |
| Tests (hermetic) | `pnpm test` |
| Run over stdio | `pnpm start` (`tsx src/index.ts`) |
| Inspect | `pnpm inspect` (`npx @modelcontextprotocol/inspector tsx src/index.ts`) |

## Conventions (not obvious from code)
- **stdout is the protocol.** Never `console.log` or write to stdout; logs go through `src/log.ts` (stderr).
- No import from `server/`, `client/`, `reviewer-core/` or any `vendor/shared`, and no tsconfig alias to them. The package owns its tool contracts (`src/contracts.ts`) and its own Zod parsers of the consumed API fields (`src/api/schemas.ts`).
- **API-schema sync:** if a response of an endpoint this package reads changes on the server, update `src/api/schemas.ts` (and its tests) in the same change.
- Only `src/api/client.ts` calls `fetch`; the `Api*Error` classes live in the I/O-free `src/api/errors.ts` — tools, `resolve.ts` and `server.ts` import errors from there, never from `client.ts` (only the `ApiClient` type and the composition root touch it). Texts shared by both run tools live in `src/format/messages.ts`; run-limiter state is `deps.runGuard`, created in `src/index.ts`. The MCP SDK is imported only by `src/server.ts`, `src/tools/index.ts` and `src/index.ts`; `format/*` and `contracts.ts` are pure.
- Tool descriptions, field descriptions and `instructions` are user-approved verbatim strings (spec "Tool descriptions (verbatim)"); change the spec first.
- Tool inputs are flat scalars; outputs are compact JSON text (no nulls, no `outputSchema`); execution errors are `isError:true` with a next step.
- The API URL must be loopback (`src/config.ts`). Wire fields stay `snake_case`.
- Never guard the entrypoint with an `import.meta.url === argv[1]` comparison: the checkout path may contain a space (`server/INSIGHTS.md`, root `AGENTS.md`).
- No linter or formatter; typecheck + tests are the gate. Tests live in `test/`, hermetic (fake `fetch`/`ApiClient`, injected clock/sleep).

## Use when
- Env, registration, Inspector → `mcp-server/README.md` · findings → `mcp-server/INSIGHTS.md`
