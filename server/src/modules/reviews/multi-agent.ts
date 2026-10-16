import { AppError } from '../../platform/errors.js';

/** Most distinct agents one multi-agent review may fan out to. */
export const MAX_MULTI_AGENT_IDS = 10;

/**
 * Validate and normalise the `agent_ids` of a multi-agent start request:
 * non-empty, not mixed with `agentId` / `all`, at most 10 distinct ids.
 * Duplicates are dropped, keeping the first occurrence's order.
 */
export function normalizeAgentIds(opts: {
  agentIds: string[];
  agentId?: string | undefined;
  all?: boolean | undefined;
}): string[] {
  if (opts.agentId !== undefined || opts.all) {
    throw new AppError('invalid_run_request', 'agent_ids cannot be combined with agentId or all', 400);
  }
  const ids = [...new Set(opts.agentIds)];
  if (ids.length === 0) {
    throw new AppError('invalid_run_request', 'agent_ids must contain at least one agent', 400);
  }
  if (ids.length > MAX_MULTI_AGENT_IDS) {
    throw new AppError(
      'invalid_run_request',
      `agent_ids accepts at most ${MAX_MULTI_AGENT_IDS} distinct agents`,
      400,
    );
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Grouping + disagreement (pure; zero LLM)
// ---------------------------------------------------------------------------

type Sev = 'CRITICAL' | 'WARNING' | 'SUGGESTION';
const SEVERITY_ORDER: Record<Sev, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** Lines apart (start to start) at which two findings still count as the same spot. */
const NEAR_LINES = 2;
const SIMILAR_TITLE_RATIO = 0.5;
const MIN_TOKEN_LENGTH = 3;

export type ColumnStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/** One child run (a column), in display order. */
export interface GroupingColumn {
  runId: string;
  agentId: string;
  agentName: string;
  status: ColumnStatus;
}

export interface GroupingFinding {
  id: string;
  runId: string;
  severity: Sev;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  rationale: string;
}

export interface GroupTake {
  agent_id: string;
  persona: string;
  verdict: Sev | 'ignored' | 'failed' | 'cancelled' | 'pending';
  note: string;
}

export interface FindingGroup {
  file: string;
  line: number;
  end_line: number;
  title: string;
  takes: GroupTake[];
  members: {
    finding_id: string;
    run_id: string;
    agent_id: string | null;
    agent_name: string;
    severity: Sev;
    title: string;
  }[];
  is_conflict: boolean;
}

/** Lowercase alphanumeric tokens of 3+ chars. */
export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((tok) => tok.length >= MIN_TOKEN_LENGTH),
  );
}

/** |A ∩ B| / max(|A|, |B|) >= 0.5; two empty token sets are never similar. */
export function titlesSimilar(a: string, b: string): boolean {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  const max = Math.max(ta.size, tb.size);
  if (max === 0) return false;
  let shared = 0;
  for (const tok of ta) if (tb.has(tok)) shared += 1;
  return shared / max >= SIMILAR_TITLE_RATIO;
}

/** Direct link: different child runs, same file, same spot, same category or similar titles. */
export function findingsLinked(a: GroupingFinding, b: GroupingFinding): boolean {
  if (a.runId === b.runId || a.file !== b.file) return false;
  const overlap = a.startLine <= b.endLine && b.startLine <= a.endLine;
  const near = Math.abs(a.startLine - b.startLine) <= NEAR_LINES;
  if (!overlap && !near) return false;
  return a.category === b.category || titlesSimilar(a.title, b.title);
}

/**
 * Group findings across child runs (transitive closure of `findingsLinked` per
 * file; singletons kept) and derive each group's per-agent takes.
 */
export function groupFindings(
  columns: GroupingColumn[],
  findings: GroupingFinding[],
): FindingGroup[] {
  // Union-find over the finding list.
  const parent = findings.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (let i = 0; i < findings.length; i += 1) {
    for (let j = i + 1; j < findings.length; j += 1) {
      if (findingsLinked(findings[i]!, findings[j]!)) parent[find(i)] = find(j);
    }
  }
  const buckets = new Map<number, number[]>();
  findings.forEach((_, i) => {
    const root = find(i);
    (buckets.get(root) ?? buckets.set(root, []).get(root)!).push(i);
  });

  const columnIndex = new Map(columns.map((c, i) => [c.runId, i]));
  const groups: FindingGroup[] = [];
  for (const idxs of buckets.values()) {
    const members = idxs
      .map((i) => findings[i]!)
      .sort(
        (a, b) =>
          (columnIndex.get(a.runId) ?? 0) - (columnIndex.get(b.runId) ?? 0) ||
          a.startLine - b.startLine,
      );
    // Highest severity wins the title; ties fall to column order (stable sort).
    const top = [...members].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0]!;
    const takes = columns.map((col): GroupTake => {
      const mine = members.filter((m) => m.runId === col.runId);
      if (mine.length > 0) {
        const best = [...mine].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0]!;
        return { agent_id: col.agentId, persona: col.agentName, verdict: best.severity, note: best.rationale };
      }
      const verdict: GroupTake['verdict'] =
        col.status === 'done' ? 'ignored'
        : col.status === 'failed' ? 'failed'
        : col.status === 'cancelled' ? 'cancelled'
        : 'pending';
      return { agent_id: col.agentId, persona: col.agentName, verdict, note: '' };
    });
    const flagged = takes.filter((t) => t.verdict === 'CRITICAL' || t.verdict === 'WARNING' || t.verdict === 'SUGGESTION');
    const ignored = takes.filter((t) => t.verdict === 'ignored');
    const severities = new Set(flagged.map((t) => t.verdict));
    groups.push({
      file: top.file,
      line: Math.min(...members.map((m) => m.startLine)),
      end_line: Math.max(...members.map((m) => m.endLine)),
      title: top.title,
      takes,
      members: members.map((m) => {
        const col = columns[columnIndex.get(m.runId) ?? 0]!;
        return {
          finding_id: m.id,
          run_id: m.runId,
          agent_id: col.agentId || null,
          agent_name: col.agentName,
          severity: m.severity,
          title: m.title,
        };
      }),
      is_conflict: (flagged.length >= 1 && ignored.length >= 1) || severities.size > 1,
    });
  }
  return groups.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Parent status from the children: any running → running, all done → done, none done → failed, else partial. */
export function parentStatus(statuses: ColumnStatus[]): 'running' | 'done' | 'partial' | 'failed' {
  if (statuses.some((s) => s === 'running' || s === 'queued')) return 'running';
  const done = statuses.filter((s) => s === 'done').length;
  if (done === statuses.length && done > 0) return 'done';
  if (done === 0) return 'failed';
  return 'partial';
}

/** Average duration / cost over a window of finished runs; cost ignores nulls. */
export function averageEstimate(
  runs: { durationMs: number | null; costUsd: number | null }[],
): { est_duration_ms: number | null; est_cost_usd: number | null } {
  const durations = runs.map((r) => r.durationMs).filter((v): v is number => v !== null);
  const costs = runs.map((r) => r.costUsd).filter((v): v is number => v !== null);
  const avg = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
  const d = avg(durations);
  return { est_duration_ms: d === null ? null : Math.round(d), est_cost_usd: avg(costs) };
}

// ---------------------------------------------------------------------------
// Learn (finding -> repo memory)
// ---------------------------------------------------------------------------

/** Upper bound on stored learning text (agent output is untrusted and unbounded). */
const MAX_LEARNING_CONTENT = 4000;

/** Memory text for a learned finding: title, location, rationale and the suggestion if any. */
export function buildLearningContent(f: {
  title: string;
  file: string;
  startLine: number;
  rationale: string;
  suggestion: string | null;
}): string {
  const parts = [f.title, `${f.file}:${f.startLine}`, f.rationale];
  if (f.suggestion) parts.push(`Suggestion: ${f.suggestion}`);
  return parts.join('\n\n').slice(0, MAX_LEARNING_CONTENT);
}

/** Provenance stored on the memory row (AC-36); origin marks it as agent output, not a human note. */
export function buildLearningSource(input: {
  prNumber: number;
  findingId: string;
  prId: string;
  runId: string | null;
  multiAgentRunId: string | null;
  agentId: string | null;
  agentName: string | null;
  decision: 'accepted' | 'dismissed' | 'undecided';
  learnedAt: Date;
}) {
  return {
    pr: input.prNumber,
    context: `Learned from a finding${input.agentName ? ` by ${input.agentName}` : ''} on PR #${input.prNumber}`,
    finding_id: input.findingId,
    pr_id: input.prId,
    ...(input.runId ? { run_id: input.runId } : {}),
    ...(input.multiAgentRunId ? { multi_agent_run_id: input.multiAgentRunId } : {}),
    ...(input.agentId ? { agent_id: input.agentId } : {}),
    ...(input.agentName ? { agent_name: input.agentName } : {}),
    decision: input.decision,
    learned_at: input.learnedAt.toISOString(),
    origin: 'agent_output' as const,
  };
}
