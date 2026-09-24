# Copilot instructions

The canonical agent guide for this repo is [`AGENTS.md`](../AGENTS.md) at the root, plus the
`AGENTS.md` in the package you touch (`server/`, `client/`, `reviewer-core/`, `e2e/`). Read and
follow them — this file only repeats the essentials for surfaces that don't load `AGENTS.md`.

- Four standalone TypeScript packages, NOT a workspace: `server` + `client` use pnpm, `reviewer-core` + `e2e` use npm.
- Verify = typecheck + tests of every touched package (no linter): `pnpm typecheck` / `pnpm test` (server, client), `npm run build` / `npm test` (reviewer-core).
- Never hand-edit `server/src/db/migrations/`, lockfiles, or `*/src/vendor/`; a `@devdigest/shared` contract change is mirrored into both server and client copies.
