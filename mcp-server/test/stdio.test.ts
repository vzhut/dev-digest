import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// Spawns the real entry over stdio. The checkout path contains a space ("AI Course"), so the
// child is started with an args array and an explicit cwd, never through a shell string.
const MCP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TSX = fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url));

let child: ChildProcessWithoutNullStreams | undefined;
afterEach(() => {
  child?.kill('SIGKILL');
  child = undefined;
});

interface Rpc {
  jsonrpc?: string;
  id?: number;
  result?: Record<string, unknown>;
  error?: unknown;
}

describe('stdio entry', () => {
  it('answers initialize and tools/list fast, keeps stdout pure, and reports an unreachable API', async () => {
    expect(existsSync(TSX)).toBe(true);
    const started = Date.now();
    child = spawn(TSX, ['src/index.ts'], {
      cwd: MCP_ROOT,
      env: { ...process.env, DEVDIGEST_API_URL: 'http://127.0.0.1:9' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const proc = child;
    proc.stderr.resume();

    const lines: string[] = [];
    const waiters = new Map<number, (m: Rpc) => void>();
    createInterface({ input: proc.stdout }).on('line', (line) => {
      lines.push(line);
      const msg = JSON.parse(line) as Rpc; // throws (fails the test) if stdout carries anything else
      if (msg.id !== undefined) waiters.get(msg.id)?.(msg);
    });
    const request = (id: number, method: string, params: unknown): Promise<Rpc> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no reply to ${method}`)), 10_000);
        waiters.set(id, (m) => {
          clearTimeout(timer);
          resolve(m);
        });
        proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });

    const init = await request(1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'stdio-test', version: '0.0.0' },
    });
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const list = await request(2, 'tools/list', {});
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(3_000);
    expect((init.result as { serverInfo: { name: string } }).serverInfo.name).toBe('devdigest');
    expect((list.result as { tools: unknown[] }).tools).toHaveLength(5);

    const call = await request(3, 'tools/call', { name: 'list_agents', arguments: {} });
    const result = call.result as { isError?: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('./scripts/dev.sh');

    for (const line of lines) {
      expect(JSON.parse(line)).toMatchObject({ jsonrpc: '2.0' });
    }

    proc.stdin.end(); // stdin close → clean exit 0
    const [code] = (await once(proc, 'exit')) as [number | null];
    expect(code).toBe(0);
  }, 20_000);
});
