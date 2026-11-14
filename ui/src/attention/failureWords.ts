/**
 * The words a failed press says (DESIGN-SYSTEM.md, *Messages*: words say what is true), for every failure dialog:
 *
 * - no answer at all (the network, a timeout), or a gateway's 502, 503 or 504 with no words of the server's own →
 *   "<server> did not answer.";
 * - the server's own error (5xx) with no words of its own → "Something went wrong in <server>.";
 * - any answer the server wrote words for (a final answer, or a 5xx it explains) → those words.
 *
 * Never the request's address or a status line. `server` is who was asked: "HQ" in hq.
 */

const GATEWAY = new Set([502, 503, 504])

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const e = error as { statusCode?: unknown; status?: unknown; response?: { status?: unknown } }
  for (const s of [e.statusCode, e.status, e.response?.status]) if (typeof s === 'number') return s
  return undefined
}

/** The words the server wrote: its JSON answer's `message` (Wasp puts the answer in `data`). */
function serverWords(error: { data?: unknown }): string | null {
  const data = error.data
  if (data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string') {
    return (data as { message: string }).message.trim() || null
  }
  return null
}

/** A request that got no answer: the browser's fetch (`TypeError`), or a client library's network error or timeout. */
function unanswered(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'NetworkError' || error.name === 'TimeoutError' || error.name === 'AbortError'
    || (error.name === 'TypeError' && /fetch|network|load failed/i.test(error.message))
}

const sentence = (server: string) => server.charAt(0).toUpperCase() + server.slice(1)

export function failureWords(error: unknown, server: string, fallback = `Something went wrong in ${server}.`): string {
  const status = statusOf(error)
  if (status === undefined) {
    if (unanswered(error)) return `${sentence(server)} did not answer.`
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'string' && error) return error
    return fallback
  }
  const own = serverWords(error as { data?: unknown })
  if (own) return own
  if (status >= 500) return GATEWAY.has(status) ? `${sentence(server)} did not answer.` : `Something went wrong in ${server}.`
  // A refusal without words of the server's own (a front door's 413, say): its message, never a status line.
  const message = error instanceof Error ? error.message : ''
  return message && !/^Request failed with status code/i.test(message) ? message : fallback
}
