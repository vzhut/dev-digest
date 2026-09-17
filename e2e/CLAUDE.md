# e2e (@devdigest/e2e)

## Before answering
Search `e2e/INSIGHTS.md` first.

## Conventions (not obvious from code)
- Deterministic locators only (`--url`, `--text`, `find role|text|label`) — never the AI `chat` command.
- `wait --text` / `wait --url` ARE the assertions: a non-zero exit fails the step.
- Flows are `specs/NN-name.flow.json`, run in lexical filename order, over read-only seeded data so nothing calls an LLM.
- Flows assume a freshly-seeded DB with the demo repo as the ONLY repo — run `./scripts/e2e.sh`, not against your dev stack.
- Uses npm, not pnpm.

## Do-not-touch
- `test-results/` (failure screenshots, gitignored)

## Use when
- Flow format, env knobs, coverage table → read `e2e/README.md`
- Findings → read `e2e/INSIGHTS.md`
