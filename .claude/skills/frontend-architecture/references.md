# frontend-architecture — references

The sources each rule is based on. Links checked on 2026-09-19. Full research list (52 sources, with the ones
we didn't use): [`docs/research/react-nextjs-architecture-sources.md`](../../../docs/research/react-nextjs-architecture-sources.md).

| SKILL.md section | Rule | Source |
|---|---|---|
| Strategy, §1 Map | Colocate route code in `app/`, `_components` private folders, "choose a strategy and be consistent" | [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) |
| §1, §7 | Shared layer + feature-local code; one direction of dependencies | [bulletproof-react — project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) |
| §2 Placement, §7 Promotion | "One consumer — local; two or more — shared" for utils, hooks, constants, components | [Robin Wieruch — React Folder Structure [2026]](https://www.robinwieruch.de/react-folder-structure/) |
| §2, §3 | Place code as close to where it's relevant as possible; tests next to code | [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) |
| §3 Anatomy | Folder per component with helpers/types/constants files | [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) |
| §4 Layers | View → state (hooks) → domain (pure) → gateway (API) | [Juntao Qiu / martinfowler.com — Modularizing React Applications](https://martinfowler.com/articles/modularizing-react-apps.html) |
| §4 | Logic into custom hooks; hooks share logic, not state | [react.dev — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) |
| §4 | Derive during render; no effect+state copies | [react.dev — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) · [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) |
| §4 | Server cache vs UI state; state in the lowest common owner | [Kent C. Dodds — Application State Management](https://kentcdodds.com/blog/application-state-management-with-react) · [TkDodo — Practical React Query](https://tkdodo.eu/blog/practical-react-query) |
| §4 | No strict container/presentational split — hooks replace it | [Dan Abramov — Presentational and Container Components (2019 note)](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) |
| §5 Pages & boundary | Server by default, `'use client'` at interactive entries, client components low in the tree | [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) · [Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) |
| §5 | TanStack Query provider placement in the App Router | [Next.js — Client-side data fetching: TanStack Query](https://nextjs.org/docs/app/guides/client-side-data-fetching/tanstack-query) |
| §6 Splitting | Split by responsibility; one thing per component | [react.dev — Thinking in React](https://react.dev/learn/thinking-in-react) · [Kent C. Dodds — When to break up a component](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components) |
| §6 | Move state down, lift content up via `children` | [Dan Abramov — Before You memo()](https://overreacted.io/before-you-memo/) |
| §7 | Prefer duplication over the wrong abstraction | [Kent C. Dodds — AHA Programming](https://kentcdodds.com/blog/aha-programming) |
| §8 Imports | No cross-feature imports, unidirectional flow | [bulletproof-react — project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) · [Feature-Sliced Design — layers](https://feature-sliced.design/docs/get-started/overview) |
| §9 index.ts | Barrel files hurt tree-shaking, dev server, circular imports | [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) |
| §10 Naming | PascalCase components, file name = component name | [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react) · `AGENTS.md` → *Naming conventions* |
