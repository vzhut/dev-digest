// User-facing texts shared by run_agent_on_pr and get_findings (single source of truth).
// Pure: no I/O. The model reads these, so each names the next step.
import { sanitizeText } from './sanitize.js';

const RUN_ERROR_MAX = 300;

export function cancelledMessage(runId: string): string {
  return `Run ${runId} was cancelled in the DevDigest UI. Call run_agent_on_pr to start a new one.`;
}

export function failedMessage(runId: string, error: string | null | undefined): string {
  if (!error) {
    return `Run ${runId} failed: no error recorded — the DevDigest API may have restarted mid-run. Call run_agent_on_pr again.`;
  }
  return `Run ${runId} failed: ${sanitizeText(error, RUN_ERROR_MAX)}. Check the agent's model and API key in DevDigest Settings, then call run_agent_on_pr again.`;
}

export function retryHint(runId: string): string {
  return `retry get_findings with run_id=${runId} in ~30s`;
}
