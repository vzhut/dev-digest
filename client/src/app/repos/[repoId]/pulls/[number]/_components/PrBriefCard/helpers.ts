import type { BriefUsage } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format-cost";
import { relativeTime } from "@/lib/relative-time";

/** A model-written file reference, split into path and (start) line. */
export interface FileRef {
  file: string;
  line: number | null;
  /** Text as shown to the user: `path`, `path:12` or `path:12-20`. */
  label: string;
}

/** `src/a.ts`, `src/a.ts:12` or `src/a.ts:12-20` → path + start line. A leading `./` or `/` is dropped,
    matching how the server grounds refs against the diff. */
export function parseFileRef(ref: string): FileRef {
  const m = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(ref.trim());
  const raw = m?.[1] ?? ref;
  const file = raw.replace(/^(\.\/|\/)+/, "");
  const line = m?.[2] ? Number(m[2]) : null;
  const label = m?.[2] ? `${file}:${m[2]}${m[3] ? `-${m[3]}` : ""}` : file;
  return { file, line, label };
}

/** 8200 → "8.2K"; below 1,000 the plain number. */
export function compactTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
}

/** "$0.014 8.2K→1.3K"; unknown cost is "—". */
export function formatBriefUsage(usage: BriefUsage): string {
  return `${formatCostUsd(usage.cost_usd)} ${compactTokens(usage.tokens_in)}→${compactTokens(usage.tokens_out)}`;
}

/** "3h ago" / "just now"; "—" when the time is unknown. */
export function whenLabel(iso: string | null | undefined, now?: number): string {
  const rel = relativeTime(iso, now);
  if (rel === "now") return "just now";
  return rel === "—" ? rel : `${rel} ago`;
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "—";
}
