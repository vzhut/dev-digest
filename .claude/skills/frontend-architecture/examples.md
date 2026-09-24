# frontend-architecture — examples

Before/after on real `client/src` code. "Before" snippets are shortened; "after" shows the target shape.

---

## 1. Fat client page → thin page + View

**Before** — `app/repos/[repoId]/pulls/[number]/page.tsx` (185 lines, `'use client'`, 10+ hooks, query-string
logic, loading/error branches, cache invalidation — all in the route file):

```tsx
"use client";
import { usePullDetail, usePulls } from "../../../../../lib/hooks";
import { usePrReviews, useCancelRun, usePrActiveRuns, usePrRuns, useDeleteRun } from "../../../../../lib/hooks/reviews";

export default function PRDetailPage() {
  const params = useParams<{ repoId: string; number: string }>();
  const { data: pulls } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  // … 150 more lines: tabs in ?tab, invalidations, skeleton, ErrorState, layout …
}
```

**After**

```
app/repos/[repoId]/pulls/[number]/
├── page.tsx
└── _components/
    ├── PrDetailView/
    │   ├── PrDetailView.tsx      "use client" — composes header + tabs, loading/error states
    │   ├── usePrDetailParams.ts  ?tab / ?trace read + write
    │   ├── styles.ts
    │   └── index.ts
    ├── PrDetailHeader/ …         (already exists)
    └── FindingsTab/ …            (already exists)
```

```tsx
// page.tsx — server component, no hooks, no "use client"
import { PrDetailView } from "./_components/PrDetailView";

/* Route: /repos/:repoId/pulls/:number. Thin route entry — see _components/PrDetailView. */
export default function PRDetailPage() {
  return <PrDetailView />;
}
```

Reference shape that already follows the rule: `app/agents/page.tsx` → `AgentsListView`.

---

## 2. Domain logic in the component body → `helpers.ts`

**Before**

```tsx
export function AgentsListView() {
  const [search, setSearch] = React.useState("");
  const { data: agents } = useAgents();
  const q = search.trim().toLowerCase();
  const list = !q ? agents ?? [] : (agents ?? []).filter((a) =>
    `${a.name} ${a.description}`.toLowerCase().includes(q),
  );
  // …
}
```

**After** — what `AgentsListView` actually does:

```ts
// AgentsListView/helpers.ts — pure, testable without React
import type { Agent } from "@devdigest/shared";

/** Case-insensitive filter over an agent's name + description. */
export function filterAgents(agents: Agent[], search: string): Agent[] {
  const q = search.trim().toLowerCase();
  if (!q) return agents;
  return agents.filter((a) => `${a.name} ${a.description}`.toLowerCase().includes(q));
}
```

```tsx
// AgentsListView.tsx
const list = filterAgents(agents ?? [], search);
```

Why: the rule "could this run in a plain Node test?" → yes → pure layer.

---

## 3. Promotion: second consumer → lowest common level

`severityCounts` groups findings by severity. It is needed by the Review-runs pills (PR **detail** route,
`FindingsPanel`) and by the findings popover (shared component used on the PR **list** route). Both must show
the same numbers → one function in `lib/`, not two copies in two route folders:

```
✗ two copies                                               ✓ one module at the lowest common level
[number]/_components/FindingsPanel/helpers.ts              lib/severity.ts        ← severityCounts, SEVERITY_RANK
  ← severityCounts                                         lib/severity.test.ts   ← its test lives with it
components/findings-popover/helpers.ts                     FindingsPanel/…               imports @/lib/severity
  ← severityCounts (copy)                                  components/findings-popover/… imports @/lib/severity
```

FindingsPanel-only logic (its filter state helpers) stays in `FindingsPanel/helpers.ts`.

Counter-example — **don't** promote: `pulls/helpers.ts#relativeTime` formats "3h / 2d" for the list column.
If another screen wants "3 hours ago", that is a different format → keep two helpers, don't force one with flags.

---

## 4. Cross-route import → promote

Hypothetical: the PR list wants the same severity pills the PR detail page has.

**Before** — the PR list route reaching into the PR detail route:

```tsx
// app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx
import { SeverityPills } from "../../[number]/_components/FindingsPanel/_components/SeverityPills";  // ✗
```

**After** — used by two routes → `components/`:

```
components/severity-pills/
├── SeverityPills.tsx
├── styles.ts
├── SeverityPills.test.tsx
└── index.ts
```

```tsx
import { SeverityPills } from "@/components/severity-pills";   // from both routes
```

---

## 5. Imports: alias outside the tree, relative inside

**Before** (`app/agents/_components/AgentsListView/AgentsListView.tsx`):

```tsx
import { AppShell } from "../../../../components/app-shell";
import { useAgents, useUpdateAgent } from "../../../../lib/hooks/agents";
import { AgentCard } from "../AgentCard";
import { CreateAgentModal } from "./_components/CreateAgentModal";
import { filterAgents } from "./helpers";
```

**After**

```tsx
import { AppShell } from "@/components/app-shell";           // outside the tree → alias
import { useAgents, useUpdateAgent } from "@/lib/hooks/agents"; // domain file, not the barrel
import { AgentCard } from "../AgentCard";                     // sibling route component, via its index.ts
import { CreateAgentModal } from "./_components/CreateAgentModal";
import { filterAgents } from "./helpers";
```

---

## 6. `index.ts`: public API, named

```ts
// ✓ components/diff-viewer/index.ts
/* Public surface: the DiffViewer component + the DiffCommentApi contract. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
```

```ts
// ✗ new folder-wide barrel
export * from "./DiffViewer";
export * from "./helpers";      // leaks internals, drags every module into every importer
export * from "./constants";
```

---

## 7. Splitting: apply the signals, not a line count

`AgentsListView` (98 lines):

```tsx
export function AgentsListView() {
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  // header, search input, template dropdown, card grid, create modal
}
```

Walk the §6 signals:
- The create flow has its own form state and is rendered conditionally → its own child: `_components/CreateAgentModal` ✓ (already done).
- Each card is repeated in `.map()` with real markup → `AgentCard` ✓ (already a route component, reused by the View).
- `search` is read by the grid filter → it stays in the View; moving it down would force lifting it back up.
- The filter itself is pure → `helpers.ts#filterAgents` ✓.

Result: nothing more to split. A 250-line component where every block reads the same state can be fine;
a 90-line one with an independent stateful block is not.

Split into a child **when**: own state · nameable with one noun · rendered conditionally as a whole · repeated in `.map()` · needs its own test.
**Not when**: the file merely passes 150 lines.

---

## 8. Server data copied into state

```tsx
// ✗ the cache is the source of truth; this copy goes stale after a mutation
const { data } = usePrRuns(prId);
const [runs, setRuns] = React.useState<RunSummary[]>([]);
React.useEffect(() => { if (data) setRuns(data); }, [data]);
```

```tsx
// ✓ derive during render
const { data: runs = [] } = usePrRuns(prId);
const failed = runs.filter((r) => r.status === "failed");
```

After a mutation, invalidate the query in the hook (`lib/hooks/reviews.ts`), not by patching local state.
