const MAX_RETRIES = 2

/**
 * A query's retry rule for a project the person may not see: an answer of 401, 403 or 404 is final (a project
 * the person has not joined answers 404, and the preview takes over at once); anything else, a dropped
 * connection for one, is tried again a couple of times.
 */
export function retryUnlessDenied(failureCount: number, error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode
  if (status === 401 || status === 403 || status === 404) return false
  return failureCount < MAX_RETRIES
}
