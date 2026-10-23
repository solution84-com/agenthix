/**
 * What a person is told when hq has no Execution Site to work with. The words
 * live in one place because the server throws them and the client shows them,
 * and a second copy is how the two stop agreeing.
 *
 * hq creates no site of its own: with none registered, an action that needs one
 * fails with the message, and a read shows the notice.
 */
export const NO_EXECUTION_SITE_MESSAGE =
  'No Execution Site is connected. A fleet admin adds one in the Fleet Console; Manage organisation › Where work runs › Sites shows how sites are doing.'

/** The banner a read-only view shows in place of an empty list it cannot explain. */
export const NO_EXECUTION_SITE_NOTICE = 'No Execution Site is connected'

/**
 * True for the error `noExecutionSiteError()` (sites/) makes. Recognised
 * by its message rather than by class so code that only translates errors
 * does not have to load the server module that throws it.
 */
export function isNoExecutionSiteError(err: unknown): boolean {
  return err instanceof Error && err.message === NO_EXECUTION_SITE_MESSAGE
}

/**
 * Whether the registry the browser holds names no Execution Site to work with.
 * `undefined` is "not loaded yet", which must not flash the notice; a revoked
 * site is no longer part of the organisation, so it does not count.
 */
export function hasNoExecutionSite(sites: readonly { status: string }[] | undefined): boolean {
  return sites !== undefined && sites.every((s) => s.status === 'REVOKED')
}
