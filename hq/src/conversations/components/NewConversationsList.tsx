import { useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useQuery, getConversations } from 'wasp/client/operations'
import { FilterSelect, SearchField } from '@agenthix/ui/primitives'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { groupByRecency } from '../../places/conversationGroups'
import { agentsOf, filterConversations } from '../../places/conversationFilter'
import { rowTime } from '../../places/conversationGroups'
import type { Place } from '../../places/placeTypes'
import { threadRows, type ThreadRow } from '../threadRows'
import { threadPath } from '../threadPaths'
import { NewConversationBox } from './NewConversationBox'
import { conversationParamOf } from '../../dock/dockAddress'
import { ArchivedConversations } from '../archive/ArchivedConversations'

function Row({ row, open }: { row: ThreadRow; open: boolean }) {
  return (
    <Link
      to={row.href}
      data-testid="conversation-row"
      aria-current={open ? 'page' : undefined}
      className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover aria-[current]:bg-accent-subtle"
    >
      <AuthedAgentAvatar name={row.agent.name} avatarUrl={row.agent.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-medium text-text-primary">{row.title || 'New conversation'}</div>
        <div className="truncate text-small text-text-muted">
          {row.agent.name}
          {row.lastEntry?.content ? ` · ${row.lastEntry.content.replace(/\s+/g, ' ').trim()}` : ''}
          {row.mark ? ` · ${row.mark}` : ''}
        </div>
      </div>
      <div className="shrink-0 pt-0.5 text-small text-text-muted">{rowTime(row.lastActivityAt)}</div>
    </Link>
  )
}

/**
 * A place's list: the person's conversations here, grouped by recency, with the
 * box that starts a new one underneath.
 */
export function NewConversationsList({ place, header, home, projectId, boxPlaceholder, noAgentsNotice }: {
  place: Place
  header: ReactNode
  home: 'PERSON' | 'PROJECT'
  projectId?: string
  boxPlaceholder: string
  noAgentsNotice: string
}) {
  const { data: conversations, isLoading, error } = useQuery(getConversations, { home, projectId })
  // The conversation open in the dock, which the shell keeps in the address's `?c=`.
  const openId = conversationParamOf(useLocation().search)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => threadRows(conversations ?? [], place.basePath), [conversations, place.basePath])
  const agents = useMemo(() => agentsOf(rows), [rows])
  const shown = useMemo(() => filterConversations(rows, agentId, search) as ThreadRow[], [rows, agentId, search])
  const groups = useMemo(() => groupByRecency(shown, (r) => r.lastActivityAt), [shown])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-4 lg:px-6 lg:pt-5">
          <div className="hidden lg:block">{header}</div>

          <div className="mt-2 flex flex-wrap items-center gap-2 lg:mt-5">
            <FilterSelect label="Filter by agent" value={agentId ?? ''} onChange={(v) => setAgentId(v || null)}>
              <option value="">All agents</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </FilterSelect>
            <SearchField
              label="Search conversations" value={search} onChange={setSearch}
              className="min-w-[140px] flex-1 lg:max-w-[220px] lg:flex-none"
            />
          </div>

          <div className="mt-2 pb-4">
            {isLoading && <p className="px-3 py-6 text-small text-text-muted">Loading…</p>}
            {error && <p role="alert" className="px-3 py-6 text-small text-danger">{error.message}</p>}
            {!isLoading && !error && rows.length === 0 && (
              <p className="px-3 py-6 text-small text-text-muted">No conversations here yet. Write below to start one.</p>
            )}
            {rows.length > 0 && shown.length === 0 && (
              <p className="px-3 py-6 text-small text-text-muted">No conversation matches.</p>
            )}
            {groups.map((g) => (
              <section key={g.label} aria-label={g.label}>
                <h4 className="px-3 pb-1 pt-4 text-small font-medium text-text-muted">{g.label}</h4>
                {g.rows.map((row) => <Row key={row.id} row={row} open={row.id === openId} />)}
              </section>
            ))}
          </div>
          <ArchivedConversations home={home} projectId={projectId} hrefOf={(id) => threadPath(place.basePath, id)} />
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl">
        <NewConversationBox home={home} projectId={projectId} basePath={place.basePath} placeholder={boxPlaceholder} noAgentsNotice={noAgentsNotice} />
      </div>
    </div>
  )
}
