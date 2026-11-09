import type { CheckResult } from './checks'

/** Credit, balance and billing words in an Inworld message, which tell an empty account from a refused key ("insufficient" alone is often about permissions). */
const NO_CREDIT = /credit|balance|billing|payment|top.?up/i

/** The message in an Inworld error body: OpenAI's `error.message`, or the gRPC gateway's `message`. */
function said(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const error = b.error
  if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
    return (error as Record<string, unknown>).message as string
  }
  if (typeof b.message === 'string') return b.message
  return typeof error === 'string' ? error : null
}

/**
 * The only place Inworld's own error bodies are read: what a failed answer says about the key. Measured shapes (the unit's
 * findings): a wrong key is a plain-text 401 `Unauthorized` on a chat call and a JSON 403 on the model list; a limit is a
 * plain-text 429 `Rate limit exceeded` with no `Retry-After`, and never a bad key. A no-credit answer was not measured (the
 * development account has credit): it is read as 402, or an error message about credit, until a real one is seen. Null for a status it has nothing to say about,
 * which the general rule then reads.
 */
export function inworldFailure(status: number, body: unknown): CheckResult | null {
  const message = said(body)
  const noCredit = message !== null && NO_CREDIT.test(message)
  if (status === 402 || ((status === 400 || status === 403 || status === 429) && noCredit)) {
    return { ok: false, kind: 'quota', detail: message ?? 'Out of credit.' }
  }
  if (status === 401 || status === 403) return { ok: false, kind: 'auth', detail: message ?? 'The key was refused.' }
  if (status === 429) return { ok: false, kind: 'rate-limit', detail: message ?? 'Too many requests just now.' }
  return null
}
