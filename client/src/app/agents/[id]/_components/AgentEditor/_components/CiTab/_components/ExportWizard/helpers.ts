import type { CiExportRequest, CiFile, CiPostAs, CiTrigger } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { KNOWN_ERROR_CODES, TRIGGER_VALUES, WORKFLOW_DIR, type KnownErrorCode } from "./constants";

/** Add or remove a trigger; the result keeps the canonical order the server expects to be unique. */
export function toggleTrigger(current: readonly CiTrigger[], trigger: CiTrigger): CiTrigger[] {
  const next = new Set(current);
  if (next.has(trigger)) next.delete(trigger);
  else next.add(trigger);
  return TRIGGER_VALUES.filter((v) => next.has(v));
}

export function buildRequest(input: {
  repoId: string;
  triggers: readonly CiTrigger[];
  postAs: CiPostAs;
  /** The edited workflow text; null sends the generated one. */
  workflow: string | null;
}): CiExportRequest {
  const base = { repo_id: input.repoId, triggers: [...input.triggers], post_as: input.postAs };
  return input.workflow === null ? base : { ...base, workflow: input.workflow };
}

/** Identity of everything that regenerates the workflow (edits are discarded when it changes). */
export function configKey(repoId: string, triggers: readonly CiTrigger[], postAs: CiPostAs): string {
  return `${repoId}|${triggers.join(",")}|${postAs}`;
}

export function isWorkflowFile(file: Pick<CiFile, "path">): boolean {
  return file.path.startsWith(WORKFLOW_DIR);
}

/** The server's error code when it has its own message, else null. */
export function knownErrorCode(error: unknown): KnownErrorCode | null {
  if (!(error instanceof ApiError) || !error.code) return null;
  return (KNOWN_ERROR_CODES as readonly string[]).includes(error.code) ? (error.code as KnownErrorCode) : null;
}

/** Download name of the zip: lowercase kebab of the agent name. */
export function zipFileName(agentName: string): string {
  const slug = agentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `devdigest-ci-${slug || "agent"}.zip`;
}

/** Hand a blob to the browser as a file download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
