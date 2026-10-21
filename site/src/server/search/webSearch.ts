/**
 * Web search for agents on OpenCode (spec, "Tool-name mapping"): the site
 * searches on the agent's behalf with the org's key, which hq sends with each
 * turn (`RunContext.webSearchKey`) and which never reaches the container, the
 * harness's environment or its home.
 *
 * Behind `WebSearchService` so the service can be swapped — SearXNG or Brave
 * later — without changing the platform tool. The first release has Exa's
 * Search API alone.
 */

export interface WebSearchRequest {
  query: string
  /** How many results to return, 1 to 10. */
  numResults: number
}

export interface WebSearchResult {
  title: string
  url: string
  publishedDate?: string
  /** The page's text, cut to a length a model can read. */
  text?: string
}

export interface WebSearchService {
  search(request: WebSearchRequest, apiKey: string): Promise<WebSearchResult[]>
}

/** A search the service refused or could not answer; its message never holds the key. */
export class WebSearchError extends Error {}

export const EXA_SEARCH_URL = 'https://api.exa.ai/search'
const EXA_TIMEOUT_MS = 25_000
const EXA_TEXT_CHARACTERS = 1_500

type Fetch = (url: string, init: RequestInit) => Promise<Response>

type ExaResult = { title?: unknown; url?: unknown; publishedDate?: unknown; text?: unknown }

const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/** Exa's Search API (`POST /search`, `x-api-key`), each result with a short cut of its page text. */
export function exaWebSearch(fetchImpl: Fetch = fetch): WebSearchService {
  return {
    async search({ query, numResults }, apiKey) {
      let res: Response
      try {
        res = await fetchImpl(EXA_SEARCH_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ query, numResults, type: 'auto', contents: { text: { maxCharacters: EXA_TEXT_CHARACTERS } } }),
          signal: AbortSignal.timeout(EXA_TIMEOUT_MS),
        })
      } catch (err) {
        throw new WebSearchError(`The search service could not be reached (${err instanceof Error ? err.name : 'error'}).`)
      }
      if (!res.ok) throw new WebSearchError(`The search service answered ${res.status}.`)
      let body: unknown
      try {
        body = await res.json()
      } catch {
        throw new WebSearchError('The search service answered something that is not JSON.')
      }
      const results = (body as { results?: unknown } | null)?.results
      if (!Array.isArray(results)) throw new WebSearchError('The search service answered without results.')
      return results.flatMap((r: ExaResult) => {
        const url = text(r?.url)
        if (!url) return []
        return [{ title: text(r.title) ?? url, url, publishedDate: text(r.publishedDate), text: text(r.text) }]
      })
    },
  }
}

/** The results as the model reads them. */
export function formatWebSearchResults(query: string, results: WebSearchResult[]): string {
  if (!results.length) return `No results for "${query}".`
  return results.map((r, i) => [
    `${i + 1}. ${r.title}`,
    `   ${r.url}${r.publishedDate ? ` (${r.publishedDate.slice(0, 10)})` : ''}`,
    ...(r.text ? [`   ${r.text.replace(/\s+/g, ' ').trim()}`] : []),
  ].join('\n')).join('\n\n')
}
