export interface DocStat {
  /** Posix, repo-relative. */
  path: string;
  sizeBytes: number;
  mtime: Date;
  text: string;
}

export type ProjectDocWriteResult =
  | { status: 'ok'; sizeBytes: number }
  | { status: 'missing'; reason: 'not found' | 'unreadable' | 'outside clone' };

export type ProjectDocReadResult =
  | { status: 'ok'; text: string; bytes: number }
  | { status: 'missing'; reason: 'not found' | 'unreadable' | 'outside clone' };

/**
 * Port: list and read project Markdown docs inside ONE clone directory.
 * Local port (like `RepoFileReader`) so the project-context module and the run
 * executor share one safe reader without importing each other.
 */
export interface ProjectDocs {
  /** Every regular `.md` file under `cloneDir` matching any glob in `roots`. */
  list(cloneDir: string, roots: string[]): Promise<DocStat[]>;
  /** Read one repo-relative path; never follows symlinks out of the clone. */
  read(cloneDir: string, path: string): Promise<ProjectDocReadResult>;
  /**
   * Replace the text of an EXISTING regular file (no symlink anywhere on its path,
   * real path inside the clone). Atomic: temp file in the same dir, then rename.
   * Never creates or deletes any other file.
   */
  write(cloneDir: string, path: string, content: string): Promise<ProjectDocWriteResult>;
  /** True when `cloneDir` is an existing directory. */
  exists(cloneDir: string): Promise<boolean>;
}

export { FsProjectDocs } from './fs.js';
