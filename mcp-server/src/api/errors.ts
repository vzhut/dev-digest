// I/O-free error classes of the DevDigest API layer. Tools, resolvers and the server import
// them from here so they never load api/client.ts (the only module that calls `fetch`).
// Messages are written for the model reading them: they name the next step.
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export class ApiUnreachableError extends ApiError {
  constructor(baseUrl: string) {
    super('unreachable', `DevDigest API is not reachable at ${baseUrl}. Start it with ./scripts/dev.sh, then retry.`);
    this.name = 'ApiUnreachableError';
  }
}
export class ApiNotFoundError extends ApiError {
  constructor(message: string) {
    super('not_found', message);
    this.name = 'ApiNotFoundError';
  }
}
export class ApiRateLimitError extends ApiError {
  constructor(public readonly retryAfterSec?: number) {
    super(
      'rate_limited',
      `DevDigest API rate limit reached${retryAfterSec ? ` — wait ${retryAfterSec} s` : ' — wait a minute'} or use get_findings on an existing run.`,
    );
    this.name = 'ApiRateLimitError';
  }
}
