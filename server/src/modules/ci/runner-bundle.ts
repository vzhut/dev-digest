import { readFile } from 'node:fs/promises';

/** The built runner, or null when missing/unreadable (maps to `runner_bundle_missing`). */
export async function readRunnerBundle(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}
