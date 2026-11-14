/**
 * The web search key checked with Exa before it is saved, as a model provider's key is checked with its vendor
 * (`providers/checks.ts`): the same timeout, no redirects, and only Exa's own message kept, with the key masked out of
 * it. Exa has no request that proves a key for nothing: its key-management API takes a team's service key, not the key
 * itself. So the check is its smallest search — one result, no page contents — which Exa bills as one search.
 *
 * Behind `WebSearchKeyCheck` so tests stand in for Exa (`useWebSearchKeyCheck`).
 */
import { messageOf } from '../providers/checks'
import { vendorMessage } from '../providers/secrecy'

export const EXA_SEARCH_URL = 'https://api.exa.ai/search'

/** The same as a model provider's check (`providers/checks.ts`). */
const TIMEOUT_MS = 10_000

/**
 * What Exa said of a key: it works; Exa refused it (`refused`, a final answer: the key is wrong, has no credit, or may
 * not search); or the key could not be checked (`unchecked`: no answer in time, Exa's own error, a rate limit, an answer
 * HQ could not read).
 */
export type WebSearchKeyVerdict =
  | { ok: true }
  | { ok: false; outcome: 'refused' | 'unchecked'; detail: string | null }

export type WebSearchKeyCheck = { check(key: string): Promise<WebSearchKeyVerdict> }

/** 401 a wrong key, 402 no credit or a budget used up, 403 a key without search: Exa's error codes. */
const REFUSED = new Set([401, 402, 403])

export function exaVerdict(status: number, body: unknown, key: string): WebSearchKeyVerdict {
  if (status >= 200 && status < 300) return { ok: true }
  const said = messageOf(body)
  const detail = said ? vendorMessage(said, key) : null
  return { ok: false, outcome: REFUSED.has(status) ? 'refused' : 'unchecked', detail }
}

export const exaKeyCheck: WebSearchKeyCheck = {
  async check(key) {
    let res: Response
    try {
      res = await fetch(EXA_SEARCH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ query: 'Exa', numResults: 1 }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'error',
      })
    } catch {
      return { ok: false, outcome: 'unchecked', detail: null }
    }
    return exaVerdict(res.status, await res.json().catch(() => null), key)
  },
}

let installed: WebSearchKeyCheck = exaKeyCheck

export function webSearchKeyCheck(): WebSearchKeyCheck {
  return installed
}

/** Tests install a fake; `null` puts Exa back. */
export function useWebSearchKeyCheck(check: WebSearchKeyCheck | null): void {
  installed = check ?? exaKeyCheck
}
