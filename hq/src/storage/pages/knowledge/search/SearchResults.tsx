import { Link } from 'react-router'
import { hitFrom, type SearchHit } from './searchScope'

/** An organisation page opens in the organisation's Knowledge, wherever the search was made. */
export const orgPageHref = (page: string) => `/org/knowledge?${new URLSearchParams({ tool: 'knowledge', page })}`

/**
 * Search results, each marked with where it is from. A result from the place itself opens in the tool through
 * `onOpen`; an organisation page opens in the organisation's Knowledge.
 */
export function SearchResults({ hits, unanswered = [], personal = false, onOpen }: {
  hits: SearchHit[]
  /** Names of the levels that could not be searched: their pages are missing from the results, not absent. */
  unanswered?: string[]
  personal?: boolean
  onOpen: (page: string) => void
}) {
  const missing = unanswered.length > 0 && (
    <p role="status" data-testid="search-unanswered" className="px-4 py-3 text-small text-text-muted">
      {unanswered.join(' and ')} could not be searched, so no pages from there are listed. Search again in a moment.
    </p>
  )
  if (hits.length === 0) return missing || <p className="px-4 py-3 text-small text-text-muted">No page matches.</p>
  return (
    <>
      <ul data-testid="search-results" className="divide-y divide-border-subtle">
        {hits.map(h => {
          const from = hitFrom(h, personal)
          const body = (
            <>
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="break-words font-medium text-text-primary">{h.title}</span>
                <span data-testid="hit-from" className="rounded-full bg-surface-2 px-2 py-px text-micro text-text-muted">{from}</span>
              </span>
              {h.description && <span className="block break-words text-small text-text-secondary">{h.description}</span>}
              {h.matches.map(m => <span key={m.line} className="block break-words text-micro text-text-muted">{m.text.trim()}</span>)}
            </>
          )
          const key = `${h.level}:${h.page}`
          const row = 'block px-4 py-2 text-small hover:bg-surface-hover max-lg:min-h-10'
          return (
            <li key={key}>
              {h.level === 'org'
                ? <Link to={orgPageHref(h.page)} className={row}>{body}</Link>
                : <button type="button" onClick={() => onOpen(h.page)} className={`${row} w-full text-left`}>{body}</button>}
            </li>
          )
        })}
      </ul>
      {missing}
    </>
  )
}
