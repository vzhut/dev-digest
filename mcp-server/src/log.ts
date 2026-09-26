// stdout is the MCP protocol channel (JSON-RPC over stdio). Anything else written
// there corrupts the stream, so every log line goes to stderr. Never use console.log.

export interface Logger {
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
}

export function createLogger(write: (line: string) => void = (line) => void process.stderr.write(line)): Logger {
  const emit = (level: string, msg: string, extra?: Record<string, unknown>): void => {
    const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
    write(`[devdigest-mcp] ${level} ${msg}${suffix}\n`);
  };
  return {
    info: (msg, extra) => emit('info', msg, extra),
    warn: (msg, extra) => emit('warn', msg, extra),
    error: (msg, extra) => emit('error', msg, extra),
  };
}
