/** Constants for the ci module (export to GitHub Actions). */

/** Branch the install PR is committed to. */
export const CI_BRANCH = 'devdigest/ci';
export const CI_PR_TITLE = 'Add DevDigest CI review';
export const CI_COMMIT_MESSAGE = 'Add DevDigest CI review';

/** Workflow file in the target repo, and its bare file name (Actions API). */
export const CI_WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';
export const CI_WORKFLOW_FILE = 'devdigest-review.yml';
/** Bump when the generated workflow template changes; drives the "outdated" badge. */
export const CI_WORKFLOW_VERSION = 1;

/** Where the bundled agent-runner lives in the target repo (ESM on every Node version). */
export const CI_RUNNER_PATH = '.devdigest/runner/index.mjs';
export const CI_AGENTS_DIR = '.devdigest/agents';
export const CI_SKILLS_DIR = '.devdigest/skills';
export const CI_MEMORY_PATH = '.devdigest/memory.jsonl';

/** Artifact the runner uploads (`devdigest-result.json` inside it). */
export const CI_ARTIFACT_NAME = 'devdigest-result';
export const CI_RESULT_FILE = 'devdigest-result.json';

/** Stable names: they identify the required check in branch protection. */
export const CI_WORKFLOW_NAME = 'DevDigest Review';
export const CI_JOB_ID = 'review';

/** Only this provider can run in CI (the workflow injects OPENROUTER_API_KEY). */
export const CI_EXPORTABLE_PROVIDER = 'openrouter';

/** Pinned third-party actions: full commit SHA + the tag it was verified against. */
export const CI_ACTION_CHECKOUT = {
  uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  tag: 'v7.0.1',
} as const;
export const CI_ACTION_UPLOAD_ARTIFACT = {
  uses: 'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9',
  tag: 'v7.0.2',
} as const;

/** `on:` triggers that would hand secrets to untrusted PR code. */
export const CI_FORBIDDEN_TRIGGERS = [
  'pull_request_target',
  'issue_comment',
  'pull_request_review_comment',
  'workflow_run',
] as const;

/** Highest permission each scope may have in the generated workflow. */
export const CI_ALLOWED_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  contents: ['read', 'none'],
  'pull-requests': ['write', 'read', 'none'],
};

export const CI_ZIP_FILENAME_PREFIX = 'devdigest-ci-';

/** Ingest (pull model): how many recent workflow runs to look at per installation. */
export const CI_SYNC_PER_PAGE = 30;
/** Max size of the artifact zip and of the unzipped result JSON. */
export const CI_MAX_ARTIFACT_BYTES = 64 * 1024;
/** Max rows of the CI runs list. */
export const CI_RUNS_LIMIT = 200;
/** Conclusions of a run without a result artifact that count as `failed` (else `skipped`). */
export const CI_FAILED_CONCLUSIONS = ['failure', 'cancelled', 'timed_out'] as const;
