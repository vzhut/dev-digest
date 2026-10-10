import type { EvalErrorCode } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';

/** A rejected eval request with a stable machine code (`finding_not_triaged`, `no_eval_cases`, …). */
export class EvalRequestError extends AppError {
  constructor(code: EvalErrorCode, message: string, statusCode = 422) {
    super(code, message, statusCode);
  }
}
