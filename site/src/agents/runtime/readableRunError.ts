/**
 * A run's failure written for the person to read as it is — a missing or
 * unusable model credential, with what to do about it. The transcript shows
 * its message verbatim; any other error is put in plain words first (core's
 * `plainFailureReason`), and the raw error stays on the run.
 */
export class ReadableRunError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReadableRunError'
  }
}
