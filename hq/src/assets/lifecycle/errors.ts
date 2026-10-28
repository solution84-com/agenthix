/** A refusal from the asset lifecycle, with the status a person's request gets. Its message ends "Nothing was changed." */
export class LifecycleError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 = 400) { super(message) }
}
