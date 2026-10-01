// Output shaping: compact JSON (no nulls), limit + truncation hint, hard size cap.

/** Hard cap on one tool response (~6K tokens, below Claude Code's 10K-token warning). */
export const MAX_RESPONSE_CHARS = 24_000;

/** Empty arrays under these keys are meaningful ("no findings") and survive `compact`. */
const KEEP_EMPTY_DEFAULT: readonly string[] = ['agents', 'findings', 'conventions'];

/** Drop `null` / `undefined` / `''` / empty objects / empty arrays (except the primary lists). */
export function compact(value: unknown, keepEmpty: readonly string[] = KEEP_EMPTY_DEFAULT): unknown {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== null && v !== undefined).map((v) => compact(v, keepEmpty));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (raw === null || raw === undefined || raw === '') continue;
      const v = compact(raw, keepEmpty);
      if (Array.isArray(v) && v.length === 0 && !keepEmpty.includes(key)) continue;
      if (!Array.isArray(v) && v !== null && typeof v === 'object' && Object.keys(v).length === 0) continue;
      out[key] = v;
    }
    return out;
  }
  return value;
}

export interface Limited<T> {
  items: T[];
  shown: number;
  total: number;
  hint?: string;
}

/** Take the first `limit` items; when some are left out, say how many and how to get them. */
export function limitWithHint<T>(items: readonly T[], limit: number, hintFor: (shown: number, total: number) => string): Limited<T> {
  const total = items.length;
  const taken = items.slice(0, Math.max(0, limit));
  const result: Limited<T> = { items: taken, shown: taken.length, total };
  if (total > taken.length) result.hint = hintFor(taken.length, total);
  return result;
}

/** Compact-serialize; if over the cap, cut the primary list (`listKey`) until it fits and say so. */
export function serialize(payload: Record<string, unknown>, listKey?: string, max: number = MAX_RESPONSE_CHARS): string {
  const full = JSON.stringify(compact(payload));
  if (full.length <= max) return full;

  const list = listKey ? payload[listKey] : undefined;
  if (listKey && Array.isArray(list)) {
    const total = typeof payload.total === 'number' ? payload.total : list.length;
    let n = list.length;
    while (n > 0) {
      n = Math.floor(n / 2);
      const cut: Record<string, unknown> = {
        ...payload,
        [listKey]: list.slice(0, n),
        shown: n,
        total,
        hint: appendHint(payload.hint, `output cut to ${n} of ${total} to fit the size cap — lower limit or raise severity_min`),
      };
      const text = JSON.stringify(compact(cut));
      if (text.length <= max) return text;
    }
  }
  return JSON.stringify({ status: 'too_large', hint: 'response exceeded the size cap — narrow the request (limit, severity_min)' });
}

function appendHint(existing: unknown, extra: string): string {
  return typeof existing === 'string' && existing ? `${existing}; ${extra}` : extra;
}
