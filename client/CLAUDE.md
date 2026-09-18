# client (@devdigest/web)

## Before answering
Search `client/docs/`, `client/specs/`, `client/INSIGHTS.md` first.

## Conventions (not obvious from code)
- Types/contracts come from `@devdigest/shared` (Zod) — never hand-duplicate them.
- All API access goes through `src/lib/api.ts`, wrapped by hooks in `src/lib/hooks/*` — never call fetch from a component.
- Feature logic lives in colocated `_components/<Name>/` with its own `<Name>.test.tsx`; `page.tsx` stays thin.

## Do-not-touch
- `src/vendor/ui/` and `src/vendor/shared/` — vendored and shared.

## Use when
- Page/route map, commands → read `client/README.md`
- Deep-dives → read `client/docs/` · UI/flow specs → read `client/specs/` · findings → read `client/INSIGHTS.md`
