/**
 * Display helpers for eval metrics. A metric is `null` when its denominator was zero (or every case
 * errored) — it renders as "—", never as 0 % or 100 %. Pure: no React, no i18n (the strings here are
 * numbers and symbols).
 */
import { formatCostUsd, UNKNOWN } from "./format-cost";

/** 0.873 → "87.3%", 1 → "100%", null → "—". */
export function formatMetric(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return UNKNOWN;
  return `${Math.round(value * 1000) / 10}%`;
}

export type DeltaDirection = "up" | "down" | "flat" | "unknown";

export function deltaDirection(delta: number | null | undefined): DeltaDirection {
  if (delta == null || !Number.isFinite(delta)) return "unknown";
  const points = Math.round(delta * 1000) / 10;
  return points > 0 ? "up" : points < 0 ? "down" : "flat";
}

/** A change in percentage points with a sign AND an arrow, so colour is never the only cue. */
export function formatDelta(delta: number | null | undefined): string {
  const direction = deltaDirection(delta);
  if (direction === "unknown") return UNKNOWN;
  const points = Math.abs(Math.round((delta as number) * 1000) / 10);
  if (direction === "up") return `▲ +${points} pts`;
  if (direction === "down") return `▼ −${points} pts`;
  return "▬ 0 pts";
}

/** Run cost: the sum of the known costs, prefixed "≥" when some were unknown; nothing known → "—". */
export function formatRunCost(cost: number | null | undefined, partial: boolean): string {
  if (cost == null) return UNKNOWN;
  return partial ? `≥ ${formatCostUsd(cost)}` : formatCostUsd(cost);
}

/** "k / n" — cases done, cases passed. */
export function progressLabel(done: number, total: number): string {
  return `${done} / ${total}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-08 09:14" in the reader's local time; the raw string when it is not a date. */
export function formatRunStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "12.3s" for a duration in milliseconds; "—" when unknown. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return UNKNOWN;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** One colour per metric, shared by every eval surface (cards, tiles, bars, trend lines). */
export const EVAL_METRIC_COLOR = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation_accuracy: "var(--warn)",
} as const;

/** Colour for a signed delta: green up, red down, muted otherwise (the arrow carries the meaning too). */
export function deltaColor(delta: number | null | undefined): string {
  const direction = deltaDirection(delta);
  return direction === "up" ? "var(--ok)" : direction === "down" ? "var(--crit)" : "var(--text-muted)";
}
