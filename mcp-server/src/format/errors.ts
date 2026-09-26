// Tool result plumbing shared by every tool. Pure: no I/O, no SDK types — the registry
// (tools/index.ts) converts a `ToolResult` into the SDK's CallToolResult.
import { serialize } from './respond.js';

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/**
 * An expected, user-fixable failure (unknown repo, disabled agent, run failed, …).
 * The message is what the model reads, so it must name the next step.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/** Execution error → `isError:true` with one short text block. */
export function toolError(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * Success → one text block of compact JSON (no nulls, capped). `listKey` names the primary
 * array that may be cut down when the response would exceed the hard size cap.
 */
export function ok(payload: Record<string, unknown>, listKey?: string): ToolResult {
  return { content: [{ type: 'text', text: serialize(payload, listKey) }] };
}
