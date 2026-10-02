import type { ContextDoc } from "@devdigest/shared";

/** One root per line; blank lines dropped. An empty result means "reset to the default roots". */
export function parseRoots(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function rootsToText(roots: string[]): string {
  return roots.join("\n");
}

export function findDoc(files: ContextDoc[], path: string | null): ContextDoc | null {
  return path ? (files.find((f) => f.path === path) ?? null) : null;
}

/** The explicit selection if it is still listed, else the first document (auto-select on load / after a refresh). */
export function effectiveSelection(files: ContextDoc[], selected: string | null): ContextDoc | null {
  return findDoc(files, selected) ?? files[0] ?? null;
}

/** Splits a repo-relative path into its directory (with trailing slash) and basename. */
export function splitPath(path: string): { dir: string; base: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", base: path } : { dir: path.slice(0, i + 1), base: path.slice(i + 1) };
}

export const ROOT_AREA = "ROOT";

/** Area of a doc: its first path segment uppercased, or ROOT for a file at the repo root. */
export function areaOf(path: string): string {
  const i = path.indexOf("/");
  return i < 0 ? ROOT_AREA : path.slice(0, i).toUpperCase();
}

export interface AreaTone {
  color: string;
  background: string;
}

const tone = (name: "accent" | "ok" | "info" | "warn" | "sugg"): AreaTone =>
  name === "accent"
    ? { color: "var(--accent-text)", background: "var(--accent-bg)" }
    : { color: `var(--${name})`, background: `var(--${name}-bg)` };

/** Deterministic palette (design-token tints, readable in both themes). */
const PALETTE: AreaTone[] = (["info", "ok", "sugg", "warn", "accent"] as const).map(tone);

const KNOWN_AREAS: Record<string, number> = { CLIENT: 0, SERVER: 1, DOCS: 2, SPECS: 3, E2E: 4, "REVIEWER-CORE": 4, "MCP-SERVER": 2 };

const ROOT_TONE: AreaTone = { color: "var(--text-secondary)", background: "var(--bg-hover)" };

/** Colour for an area tag: fixed for known areas, hash-to-palette for the rest, neutral for ROOT. */
export function areaTone(area: string): AreaTone {
  if (area === ROOT_AREA) return ROOT_TONE;
  const known = KNOWN_AREAS[area];
  if (known !== undefined) return PALETTE[known]!;
  let h = 0;
  for (let i = 0; i < area.length; i++) h = (h * 31 + area.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** UTF-8 byte length, as the server measures the 1 MiB cap. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
