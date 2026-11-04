/** A refusal from the asset lifecycle, with the status a person's request gets. Its message ends "Nothing was changed." */
export class LifecycleError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 = 400) { super(message) }
}

/** A database's unique-key refusal: two writers made the same row at the same moment. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}
