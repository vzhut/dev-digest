// createMcpServer(deps): builds the McpServer and registers the tool registry. Handlers get
// a ToolContext (abort signal + progress notifier) and never throw at the protocol level:
// expected failures become `isError` results, anything else is logged to stderr.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError } from './api/errors.js';
import type { ToolContext, ToolDeps } from './deps.js';
import { ToolError, toolError, type ToolResult } from './format/errors.js';
import { SERVER_INSTRUCTIONS, TOOLS } from './tools/index.js';

export const SERVER_NAME = 'devdigest';
export const SERVER_VERSION = '0.1.0';
export const INTERNAL_ERROR_TEXT = 'Internal error in devdigest-mcp — see stderr';

interface RequestExtra {
  signal: AbortSignal;
  _meta?: { progressToken?: string | number };
  sendNotification: (n: {
    method: 'notifications/progress';
    params: { progressToken: string | number; progress: number; total?: number; message?: string };
  }) => Promise<void>;
}

function contextFor(extra: RequestExtra, deps: ToolDeps): ToolContext {
  const token = extra._meta?.progressToken;
  return {
    signal: extra.signal,
    progress: async (p) => {
      if (token === undefined) return;
      try {
        await extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, ...p } });
      } catch (err) {
        deps.log.warn('progress notification failed', { error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

function toCallToolResult(r: ToolResult): CallToolResult {
  return { content: r.content.map((c) => ({ type: 'text' as const, text: c.text })), ...(r.isError ? { isError: true } : {}) };
}

/** `deps.runGuard` (rate limiter + in-flight map) is explicit state: build it once, share it. */
export function createMcpServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: SERVER_INSTRUCTIONS });

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputShape, annotations: tool.annotations },
      async (args: unknown, extra: unknown): Promise<CallToolResult> => {
        try {
          const result = await tool.handler(deps, args as never, contextFor(extra as RequestExtra, deps));
          return toCallToolResult(result);
        } catch (err) {
          if (err instanceof ToolError || err instanceof ApiError) return toCallToolResult(toolError(err.message));
          deps.log.error(`unexpected error in ${tool.name}`, {
            error: err instanceof Error ? (err.stack ?? err.message) : String(err),
          });
          return toCallToolResult(toolError(INTERNAL_ERROR_TEXT));
        }
      },
    );
  }
  return server;
}
