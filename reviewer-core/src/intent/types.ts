import type { Intent, IntentConfidence, IntentSourceKind } from '@devdigest/shared';

/**
 * Intent layer — input/output shapes. Pure data: the server does all the
 * fetching (GitHub issues, repo files, tickets) and hands the results in here.
 */

/** A source whose text was loaded (fully or truncated by the caller). */
export interface LoadedIntentSource {
  kind: Extract<IntentSourceKind, 'github_issue' | 'repo_file' | 'external_ticket'>;
  /** Stable reference, e.g. `#12`, `specs/ratelimit.md`, `ABC-1`. */
  ref: string;
  text: string;
}

/** A referenced source that could not be read. Trusted: produced by our resolver. */
export interface UnavailableIntentSource {
  kind: IntentSourceKind;
  ref: string;
  status: 'missing' | 'blocked';
  reason: string;
}

export interface IntentFile {
  path: string;
  additions?: number;
  deletions?: number;
}

export interface IntentPromptInput {
  prNumber?: number;
  title: string;
  /** PR body (untrusted). May be empty. */
  description: string;
  files: IntentFile[];
  /**
   * `@@ … @@` hunk header lines. Anything else passed here is dropped by the
   * prompt builder — the classifier never sees diff bodies.
   */
  hunkHeaders: string[];
  sources: LoadedIntentSource[];
  unavailable: UnavailableIntentSource[];
}

/** Named prompt component and its size, for logging (never the content). */
export interface PromptComponent {
  name: string;
  chars: number;
  /** Who produced the text (`pr-author`, `git-metadata`, `classifier-prompt`, or a linked source kind). */
  source: string;
}

/** The intent as handed to the reviewer engine. */
export interface ReviewIntent {
  intent: Intent;
  confidence: IntentConfidence;
  missingContext: string[];
}
