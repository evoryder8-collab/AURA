export type RepositoryErrorCode =
  | 'configuration'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'invalid_response'
  | 'read_failed'
  | 'write_failed'

const messages: Record<RepositoryErrorCode, string> = {
  configuration: 'The selected data source is not configured.',
  unauthorized: 'An authenticated session is required.',
  forbidden: 'The current account cannot perform this data operation.',
  not_found: 'The requested record is unavailable.',
  invalid_input: 'The requested data operation is invalid.',
  invalid_response: 'The data source returned an unexpected response.',
  read_failed: 'The requested records could not be loaded.',
  write_failed: 'The requested change could not be saved.',
}

/** Privacy-safe repository error: raw provider errors and record values are never exposed. */
export class AuraRepositoryError extends Error {
  readonly code: RepositoryErrorCode
  readonly operation: string

  constructor(code: RepositoryErrorCode, operation: string) {
    super(messages[code])
    this.name = 'AuraRepositoryError'
    this.code = code
    this.operation = operation
  }
}

export function repositoryError(code: RepositoryErrorCode, operation: string) {
  return new AuraRepositoryError(code, operation)
}

export function isAuraRepositoryError(error: unknown): error is AuraRepositoryError {
  return error instanceof AuraRepositoryError
}

export function asRepositoryError(
  error: unknown,
  fallbackCode: Extract<RepositoryErrorCode, 'read_failed' | 'write_failed'>,
  operation: string,
) {
  return isAuraRepositoryError(error) ? error : repositoryError(fallbackCode, operation)
}
