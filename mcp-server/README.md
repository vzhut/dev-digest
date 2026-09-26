# devdigest-mcp

A local MCP server (stdio transport only) that lets a coding agent such as Claude Code drive DevDigest. It calls the DevDigest REST API (default `http://localhost:3001`) and holds no secrets.

Tools: `list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius` (stub: always an error until the L04 homework).

## Setup
```bash
cd mcp-server && pnpm install
```
The DevDigest stack must be running (`./scripts/dev.sh`) for tools to answer; the server itself starts without network access.

## Environment
| Variable | Default | Meaning |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | API base URL. Loopback only (`localhost`, `127.0.0.1`, `::1`); anything else is rejected at startup. |
| `DEVDIGEST_MCP_RUN_LIMIT` | `5` | Max paid runs this process starts per 10 minutes (1-100). |

## Register in Claude Code
Project-scoped `.mcp.json` at the repo root:
```json
{
  "mcpServers": {
    "devdigest": {
      "type": "stdio",
      "command": "mcp-server/node_modules/.bin/tsx",
      "args": ["mcp-server/src/index.ts"],
      "env": { "DEVDIGEST_API_URL": "http://localhost:3001" }
    }
  }
}
```

## Tools
| Tool | What it does |
|---|---|
| `list_agents` | Enabled review agents (name, id, model, purpose). Call first. |
| `run_agent_on_pr` | Runs one agent on a PR and **blocks up to 120 s** (stops polling at ~115 s so it answers before Claude Code auto-backgrounds the call). Paid LLM call; at most 5 per 10 min per process. On timeout it returns `{status:"running", run_id}` and the run keeps going: read it later with `get_findings`. |
| `get_findings` | Findings of a finished review (verdict, blockers, score, severity-sorted). Free. |
| `get_conventions` | The repo's accepted conventions. Never triggers extraction. |
| `get_blast_radius` | Stub: always an error until the L04 homework. |

Args are flat: `repo` = `owner/name`, `pr` = number, `agent` = name or id.

## Launch
The stdio entry has no path guard, so it works from any directory, including a checkout path with spaces:
```bash
mcp-server/node_modules/.bin/tsx mcp-server/src/index.ts   # from the repo root
```
It exits 0 when stdin closes or on SIGINT. Startup makes no network call; a bad `DEVDIGEST_API_URL` exits 1 with a message on stderr. stdout carries only protocol messages.

## Inspect
```bash
cd mcp-server && pnpm inspect
```

## Develop
`pnpm typecheck` · `pnpm test` (hermetic; includes an in-memory protocol test and a real stdio spawn) · see `AGENTS.md` for the rules (stdout is the protocol, no imports from other packages).
