/**
 * The quiet retry (DESIGN-SYSTEM.md, *Messages*): one policy for every read a screen makes on its own. Up to three
 * retries after the first failure, at about 1, 2 and 4 seconds, none on a final answer; nothing is shown meanwhile.
 */

export const BACKGROUND_RETRIES = 3

/** Answers that asking again cannot change: bad request, not signed in, not allowed, not found, conflict, refused. */
const FINAL = new Set([400, 401, 403, 404, 409, 422])

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const e = error as { statusCode?: unknown; status?: unknown; response?: { status?: unknown } }
  for (const s of [e.statusCode, e.status, e.response?.status]) if (typeof s === 'number') return s
  return undefined
}

/** A final answer: the read is not retried. */
export function isFinal(error: unknown): boolean {
  const status = statusOf(error)
  return status !== undefined && FINAL.has(status)
}

/** A query's `retry`: `failures` counts the failures before this one, as React Query passes it (0 on the first). */
export function backgroundRetry(failures: number, error: unknown): boolean {
  return !isFinal(error) && failures < BACKGROUND_RETRIES
}

/** A query's `retryDelay`: 1, 2 and 4 seconds for attempts 0, 1 and 2, each ±20 % so tabs do not retry together. */
export function backgroundRetryDelay(attempt: number, random: () => number = Math.random): number {
  return Math.round(1000 * 2 ** attempt * (0.8 + 0.4 * random()))
}

export interface RetryReadOptions {
  /** Retries after the first failure; the policy's three when not given. */
  retries?: number
  /** Stops waiting between tries; the read's last failure is thrown. */
  signal?: AbortSignal
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>(resolve => {
  const t = setTimeout(done, ms)
  function done() { clearTimeout(t); signal?.removeEventListener('abort', done); resolve() }
  signal?.addEventListener('abort', done)
})

/** A hidden tab waits, and tries again when it is shown. */
const whenShown = (signal?: AbortSignal) => new Promise<void>(resolve => {
  if (typeof document === 'undefined' || !document.hidden) { resolve(); return }
  function done() { document.removeEventListener('visibilitychange', check); signal?.removeEventListener('abort', done); resolve() }
  function check() { if (!document.hidden) done() }
  document.addEventListener('visibilitychange', check)
  signal?.addEventListener('abort', done)
})

/**
 * The same policy for a hand-written read or one turn of a poll: tries `read`, and on a failure that is not final tries
 * again after the policy's delay, up to `retries` times. Resolves with the first answer; throws the last failure.
 */
export async function retryRead<T>(read: () => Promise<T>, { retries = BACKGROUND_RETRIES, signal }: RetryReadOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read()
    } catch (error) {
      if (isFinal(error) || attempt >= retries || signal?.aborted) throw error
      await sleep(backgroundRetryDelay(attempt), signal)
      await whenShown(signal)
      if (signal?.aborted) throw error
    }
  }
}
