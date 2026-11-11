import { siteReadRetry } from '../../../shared/siteRead'

/** An error that says the thing asked for is not there: asking again cannot change that. */
export function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { statusCode?: unknown }).statusCode === 404
}

/**
 * How a knowledge read tries again: the one policy for reads, which never retries a page that is gone, nor a site that
 * did not answer (HQ already waited for it).
 */
export const retryUnlessGone = siteReadRetry
