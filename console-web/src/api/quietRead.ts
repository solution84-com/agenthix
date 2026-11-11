import { retryRead, type BackgroundQuery } from '@agenthix/ui/attention'
import { api, ApiError } from './client'

/** How many times a quiet read is tried again; the policy's three unless a test sets it (the tests set it to none). */
export const quietReadPolicy: { retries: number | undefined } = { retries: undefined }

/**
 * One read the screen makes on its own (an opening read, a poll's turn): tried again quietly, as hq's reads are
 * (ui/DESIGN-SYSTEM.md, *Messages*), so a failure that passes is never seen. Throws the last failure once the retries
 * are spent, or at once for a final answer (400, 401, 403, 404, 409, 422).
 */
export const quietly = <T>(read: () => Promise<T>, signal?: AbortSignal): Promise<T> => retryRead(read, { retries: quietReadPolicy.retries, signal })

export const apiRead = <T>(path: string, signal?: AbortSignal): Promise<T> => quietly(() => api<T>(path), signal)

/** What `useBackgroundRead` needs of a hand-written read: the data on screen, how the last read failed, and when it was read. */
export function backgroundQuery(held: { data: unknown; error?: unknown; readAt: Date | null; refetch: () => void }): BackgroundQuery {
  return { data: held.data ?? undefined, error: held.error ?? null, dataUpdatedAt: held.readAt?.getTime() ?? 0, refetch: held.refetch }
}

/**
 * Why a read of the Fleet Console's own did not come back, for the nudge: these reads never go to HQ, so the nudge must not
 * say it did. The Fleet Console not answering is status 0; any other failure is said in the server's words.
 */
export function becauseOf(error: unknown): string {
  if (error instanceof ApiError && error.status !== 0) return error.message
  return 'The Fleet Console did not answer.'
}
