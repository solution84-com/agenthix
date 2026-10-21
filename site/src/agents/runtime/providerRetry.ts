/**
 * What a turn says while its harness retries a failed model request, and when
 * the site stops waiting for it — the same for both runtimes.
 *
 * Each harness retries a failed model request itself, with backoff: OpenCode
 * up to five times over about seventy seconds, the Claude CLI up to its own
 * limit. Someone watching the chat saw only "…" meanwhile. So every retry is
 * shown, and after RETRY_LIMIT retries — about fifteen seconds of backoff —
 * the turn is ended with the provider's own reason: a brief overload has
 * usually cleared by then, and a rate limit that has not (a free model's
 * per-minute quota) will not clear within the harness's remaining tries
 * either. A single announced wait longer than RETRY_WAIT_LIMIT_MS (a
 * provider's retry-after) ends it at once, for the same reason.
 */
export const RETRY_LIMIT = 3
export const RETRY_WAIT_LIMIT_MS = 60_000

const RATE_LIMITED = /\b429\b|rate[ _-]?limit|too many requests/i

export type ProviderRetry = {
  attempt: number
  /** The provider's own reason, as the harness reports it. */
  reason: string
  /** How long until the harness tries again, when it says. */
  waitMs?: number
  /** The harness has classified this as a rate limit. */
  rateLimited?: boolean
}

function rateLimited(retry: ProviderRetry): boolean {
  return retry.rateLimited === true || RATE_LIMITED.test(retry.reason)
}

/** What the chat shows while the harness waits to retry. */
export function retryNotice(retry: ProviderRetry): string {
  const what = rateLimited(retry)
    ? 'The provider is rate-limiting this model'
    : `The model provider failed${retry.reason ? ` (${retry.reason})` : ''}`
  return `${what}; retrying (attempt ${retry.attempt})…`
}

/** The turn's error once the site stops waiting, or null while it may retry. */
export function retryGiveUp(retry: ProviderRetry): string | null {
  const tooLong = retry.waitMs !== undefined && retry.waitMs > RETRY_WAIT_LIMIT_MS
  if (retry.attempt <= RETRY_LIMIT && !tooLong) return null
  const why = tooLong
    ? `The model provider asked to wait ${Math.ceil(retry.waitMs! / 1000)} s before trying again`
    : `The model provider was still failing after ${retry.attempt - 1} retries`
  return `${why}: ${retry.reason || 'no reason given'}`
}

/**
 * The hint about credentials, only where the evidence is about credentials:
 * the provider refused them (401, 403, or the harness says so). Anything else
 * carries the provider's own reason and no guess.
 */
export const CREDENTIAL_HINT = 'Check that the credential for this provider is set up correctly.'

export function withCredentialHint(text: string, status: number | null | undefined, refused = false): string {
  if (!refused && status !== 401 && status !== 403) return text
  return `${text}${/[.!?]$/.test(text) ? '' : '.'} ${CREDENTIAL_HINT}`
}
