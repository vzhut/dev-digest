# reviewer-core (@devdigest/reviewer-core)

## Before answering
Search `reviewer-core/docs/`, `reviewer-core/specs/`, `reviewer-core/INSIGHTS.md` first.

## Conventions (not obvious from code)
- No DB, GitHub, or filesystem access — the only side effect is the injected `LLMProvider`. This is the package's reason to exist; don't breach it for convenience.
- Emits no JS: `build` is a type-check, consumers import the TS source via tsconfig path alias.
- Grounding is mandatory and the score is always recomputed from surviving findings — the model's self-reported score is ignored by design.
- Prompt-injection defense is one shared `INJECTION_GUARD` + `wrapUntrusted()` — never replace it with keyword/denylist scanning.
- Uses npm, not pnpm.

## Use when
- Pipeline diagram, public API → read `reviewer-core/README.md`
- Deep-dives → read `reviewer-core/docs/` · behaviour specs → read `reviewer-core/specs/` · findings → read `reviewer-core/INSIGHTS.md`
