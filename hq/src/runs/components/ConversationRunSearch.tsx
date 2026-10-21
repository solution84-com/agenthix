import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { searchConversationRuns } from 'wasp/client/operations'
import type { ConversationRunHits } from '../../shared/conversations/protocol'
import { actionErrorText } from '../../conversations/hooks/threadState'

const addressOf = (hit: { runId: string; sessionId: string }, conversationId: string) =>
  `/runs/${hit.runId}?session=${hit.sessionId}&conversation=${conversationId}`

/**
 * What a conversation's runs said, searched for the words typed above. The sites are asked only when the person
 * asks here, never as they type; a site that could not answer is named.
 */
export function ConversationRunSearch({ conversationId, query }: { conversationId: string; query: string }) {
  const [result, setResult] = useState<{ asked: string; hits: ConversationRunHits } | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => { setResult(null); setProblem(null) }, [conversationId])
  if (!query) return null

  const ask = async () => {
    setBusy(true)
    setProblem(null)
    try {
      setResult({ asked: query, hits: await searchConversationRuns({ conversationId, query }) })
    } catch (err) {
      setProblem(actionErrorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="border-b border-border-subtle px-3 py-2" data-testid="conversation-run-search">
      <button type="button" disabled={busy} onClick={() => void ask()} className="cursor-pointer text-small text-accent hover:underline disabled:cursor-wait disabled:opacity-60">
        {busy ? 'Searching…' : `Search what its runs said for “${query}”`}
      </button>
      {problem && <p role="alert" className="mt-1 text-small text-danger">{problem}</p>}
      {result && (
        <div className="mt-2 space-y-2">
          {result.hits.unavailable.length > 0 && (
            <p role="status" className="text-small text-text-secondary">
              Could not reach {result.hits.unavailable.join(', ')}, so what its runs said there is not searched.
            </p>
          )}
          {result.hits.hits.length === 0 && <p className="text-small text-text-muted">No run said “{result.asked}”.</p>}
          <ul>
            {result.hits.hits.map((hit) => (
              <li key={hit.runId}>
                <Link to={addressOf(hit, conversationId)} className="block rounded-md px-2 py-1.5 hover:bg-surface-hover">
                  <span className="block truncate text-small font-medium text-text-primary">{hit.title ?? 'A run'}</span>
                  <span className="block text-small text-text-muted">{hit.excerpt}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
