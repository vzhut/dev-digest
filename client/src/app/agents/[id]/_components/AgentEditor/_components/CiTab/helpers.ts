import type { CiInstallation, CiRunItem } from "@devdigest/shared";

/**
 * An installation is outdated when the exported agent or workflow is older than what the studio has now.
 * The current workflow version comes from the server, so there is no second copy of it here.
 */
export function isOutdated(
  installation: Pick<CiInstallation, "manifest_version" | "workflow_version" | "current_workflow_version">,
  agentVersion: number,
): boolean {
  return (
    installation.manifest_version < agentVersion ||
    installation.workflow_version < installation.current_workflow_version
  );
}

export function activeCount(installations: readonly CiInstallation[]): number {
  return installations.filter((i) => i.status === "active").length;
}

/** The runs of one agent (the list arrives newest first and keeps that order). */
export function runsOfAgent(runs: readonly CiRunItem[], agentId: string): CiRunItem[] {
  return runs.filter((r) => r.agent_id === agentId);
}

/** The newest run of an agent in one repo, or undefined. */
export function lastRunIn(runs: readonly CiRunItem[], repo: string): CiRunItem | undefined {
  return runs.find((r) => r.repo === repo);
}
