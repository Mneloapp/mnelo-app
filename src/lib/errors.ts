export type ErrorCode =
  | 'NETWORK_UNAVAILABLE'
  | 'REQUEST_TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNEXPECTED';

export class AppError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
    this.name = 'AppError';
  }
}

// Deliberately allow-list telemetry instead of trying to scrub arbitrary payloads.
// A future monitoring adapter may accept this record, never the original Error.
export function safeErrorRecord(error: unknown): { code: ErrorCode } {
  return { code: error instanceof AppError ? error.code : 'UNEXPECTED' };
}
