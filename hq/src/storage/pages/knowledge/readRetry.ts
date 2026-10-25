/** An error that says the thing asked for is not there: asking again cannot change that. */
export function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { statusCode?: unknown }).statusCode === 404
}

/** How a knowledge read tries again: a few times for a site that is slow, never for a page that is gone. */
export const retryUnlessGone = (failures: number, error: unknown): boolean => !isNotFound(error) && failures < 3
