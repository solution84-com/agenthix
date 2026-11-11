import { backgroundRetry } from '@agenthix/ui/attention'

/**
 * A query's retry rule for a project the person may not see: the one policy for reads (`backgroundRetry`), which
 * never retries a final answer, so a project the person has not joined (404) hands over to the preview at once.
 */
export const retryUnlessDenied = backgroundRetry

/** A final answer of 401, 403 or 404: the thing is not there for this person, which is not a read that failed. */
export function isDenied(error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode
  return status === 401 || status === 403 || status === 404
}
