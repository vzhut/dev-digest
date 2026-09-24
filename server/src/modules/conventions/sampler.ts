import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Root + one level down directory listing (relative paths, forward-slash
 * separated), for config-file discovery only (§4.2 step 1) — NOT the
 * recursive repo walk `repo-intel/pipeline/walk.js` does for indexing. That
 * one is repo-intel's own module; this one stays local and bounded (two
 * `readdir` calls deep, at most) so it never needs a full-tree scan.
 */
export async function listRootAndOneLevelDown(clonePath: string): Promise<string[]> {
  const out: string[] = [];
  let rootEntries;
  try {
    rootEntries = await readdir(clonePath, { withFileTypes: true });
  } catch {
    return out; // clonePath vanished/unreadable — degrade to "no config files", never throw
  }
  for (const entry of rootEntries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    if (entry.isFile()) {
      out.push(entry.name);
    } else if (entry.isDirectory()) {
      try {
        const subEntries = await readdir(join(clonePath, entry.name), { withFileTypes: true });
        for (const sub of subEntries) {
          if (sub.isFile()) out.push(`${entry.name}/${sub.name}`);
        }
      } catch {
        // unreadable subdir (permissions, symlink loop) — skip it, keep going
      }
    }
  }
  return out;
}
