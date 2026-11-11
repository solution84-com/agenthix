import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, getArchivedConversations, reopenConversation } from 'wasp/client/operations'
import { SearchField, FOCUS_RING } from '@agenthix/ui/primitives'
import { rowTime } from '../../places/conversationGroups'
import { actionErrorText } from '../hooks/threadState'
import { ReadFailure, ShowAttention } from '@agenthix/ui/attention'

/**
 * The conversations archived in a place: hidden from the list, kept, found by search and reopened by a tap. Closed
 * until asked for, so a place's list costs nothing for them.
 */
export function ArchivedConversations({ home, projectId, hrefOf }: {
  home: 'PERSON' | 'PROJECT'
  projectId?: string
  hrefOf: (conversationId: string) => string
}) {
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="Archived conversations" className="border-t border-border-subtle pb-4 pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`rounded px-3 py-2 text-small font-medium text-link hover:underline max-lg:min-h-10 ${FOCUS_RING}`}
      >
        {open ? 'Hide archived conversations' : 'Archived conversations'}
      </button>
      {open && <ArchivedList home={home} projectId={projectId} hrefOf={hrefOf} />}
    </section>
  )
}

function ArchivedList({ home, projectId, hrefOf }: { home: 'PERSON' | 'PROJECT'; projectId?: string; hrefOf: (id: string) => string }) {
  const [search, setSearch] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const query = search.trim() || undefined
  const { data, isLoading, error } = useQuery(getArchivedConversations, { home, projectId, query })
  const reopen = async (conversationId: string) => {
    setProblem(null)
    try {
      await reopenConversation({ conversationId })
    } catch (err) {
      setProblem(actionErrorText(err))
    }
  }
  const rows = data?.conversations ?? []
  return (
    <div className="px-3" data-testid="archived-list">
      <SearchField label="Search archived conversations" value={search} onChange={setSearch} className="mb-2 max-w-[260px]" />
      {isLoading && <p className="py-3 text-small text-text-muted">Loading…</p>}
      {error && <ReadFailure what="The archived conversations" error={error} />}
      <ShowAttention text={problem} onClose={() => setProblem(null)} />
      {!isLoading && !error && rows.length === 0 && (
        <p className="py-3 text-small text-text-muted">{query ? 'No archived conversation matches.' : 'Nothing is archived here.'}</p>
      )}
      <ul>
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 rounded-lg px-1 py-2" data-testid="archived-row">
            <Link to={hrefOf(row.id)} className={`rounded min-w-0 flex-1 hover:underline ${FOCUS_RING}`}>
              <span className="block truncate text-body text-text-primary">{row.title || 'New conversation'}</span>
              <span className="block truncate text-small text-text-muted">{row.agent?.name ?? 'No agent'} · {rowTime(row.lastMessageAt)}</span>
            </Link>
            <button type="button" onClick={() => void reopen(row.id)} className={`rounded shrink-0 text-small text-link hover:underline max-lg:min-h-10 ${FOCUS_RING}`}>
              Reopen
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
