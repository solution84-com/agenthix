import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { MessageSquare, Plus, X, ArrowLeft, Search, Maximize2, Minimize2 } from 'lucide-react'
import type { SessionListItem } from './types'
import { AgentAvatar } from './SessionComponents'
import { FIELD, FOCUS_RING_INSET, ROW_CHOSEN, ROW_ITEM } from '../primitives/controlStyles'
import { BUTTON_GHOST } from '../primitives/buttonStyles'

function formatRelativeTime(date: Date | string): string {
  const d = new Date(date)
  const diffMins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return `${Math.floor(diffHrs / 24)}d ago`
}

export interface SessionAgentItem {
  id: string
  name: string
  avatarUrl: string | null
  models?: string[]
}

export interface PanelSessionListQueries {
  getSessions: () => Promise<SessionListItem[]>
  getAgents: () => Promise<SessionAgentItem[]>
}

export interface PanelSessionListActions {
  createSession: (args: { agentId: string }) => Promise<{ id: string }>
}

export interface PanelSessionListProps {
  activeSessionId: string | null
  queries: PanelSessionListQueries
  actions: PanelSessionListActions
  onSelectSession: (sessionId: string) => void
  onNewSession?: () => void
  onClose?: () => void
  onMaximizeToggle?: () => void
  isFullMode?: boolean
  hideHeader?: boolean
  /** Shown above the list — the app's word that some of what the list holds could not be read. */
  notice?: ReactNode
}

export function PanelSessionList({
  activeSessionId,
  queries,
  actions,
  onSelectSession,
  onClose,
  onMaximizeToggle,
  isFullMode,
  hideHeader,
  notice,
}: PanelSessionListProps) {
  const [sessions, setSessions] = useState<SessionListItem[] | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [filterText, setFilterText] = useState('')

  const fetchSessions = useCallback(async () => {
    try {
      const data = await queries.getSessions()
      setSessions(data)
    } finally {
      setIsLoading(false)
    }
  }, [queries])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center gap-2 px-4 h-12 border-b border-border shrink-0">
          {showNew ? (
            <button onClick={() => setShowNew(false)} className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer">
              <ArrowLeft size={16} />
            </button>
          ) : (
            <MessageSquare size={15} className="text-text-muted" />
          )}
          <span className="text-body font-medium text-text-primary flex-1">
            {showNew ? 'New Session' : 'Sessions'}
          </span>
          {!showNew && (
            <button
              onClick={() => setShowNew(true)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-micro font-medium cursor-pointer ${BUTTON_GHOST}`}
            >
              <Plus size={13} />
              New
            </button>
          )}
          {onMaximizeToggle && (
            <button onClick={onMaximizeToggle} className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer" title={isFullMode ? 'Restore panel' : 'Expand panel'}>
              {isFullMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer ml-1">
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {/* Search bar (session list only) */}
      {!showNew && (
        <div className="px-3 py-2 border-b border-border-subtle shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              placeholder="Search sessions..."
              className={`${FIELD} w-full rounded-lg pl-7 pr-3 py-1.5 text-small text-text-secondary`}
            />
          </div>
        </div>
      )}

      {showNew ? (
        <NewSessionView
          getAgents={queries.getAgents}
          createSession={actions.createSession}
          onCreated={(id) => { setShowNew(false); onSelectSession(id) }}
        />
      ) : (
        <>
        {notice}
        <SessionListView
          sessions={sessions}
          isLoading={isLoading}
          filterText={filterText}
          onSelect={onSelectSession}
          activeSessionId={activeSessionId}
        />
        </>
      )}
    </div>
  )
}

function SessionListView({ sessions, isLoading, filterText, onSelect, activeSessionId }: {
  sessions: SessionListItem[] | undefined
  isLoading: boolean
  filterText: string
  onSelect: (id: string) => void
  activeSessionId?: string | null
}) {
  if (isLoading) {
    return (
      <div className="flex-1 p-3 space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-xl bg-surface-2 animate-pulse" />
        ))}
      </div>
    )
  }

  const q = filterText.trim().toLowerCase()
  const active = (sessions?.filter(s => s.status === 'ACTIVE') ?? [])
    .filter(s => !q
      || (s.title ?? '').toLowerCase().includes(q)
      || (s.agent?.name ?? '').toLowerCase().includes(q)
    )

  if (active.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
        <MessageSquare size={28} className="text-text-muted/70" />
        <p className="text-body text-text-muted">{q ? 'No matching sessions' : 'No sessions yet'}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1" style={{ scrollbarWidth: 'thin' }}>
      {active.map(session => {
        const agentName = session.agent?.name ?? 'Agent'
        const lastEntry = session.entries?.[0]
        return (
          <button
            key={session.id}
            onClick={() => onSelect(session.id)}
            className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors cursor-pointer group ${
              session.id === activeSessionId
                ? `border border-transparent ${ROW_CHOSEN}`
                : `border border-transparent ${ROW_ITEM}`
            }`}
          >
            <AgentAvatar name={agentName} avatarUrl={session.agent?.avatarUrl ?? null} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-small font-medium text-text-secondary truncate group-hover:text-text-primary transition-colors">
                  {session.title || agentName}
                </span>
                <span className="text-micro text-text-muted shrink-0">{formatRelativeTime(session.updatedAt)}</span>
              </div>
              {lastEntry && (
                <p className="text-micro text-text-muted truncate mt-0.5">{lastEntry.content}</p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function NewSessionView({
  getAgents,
  createSession,
  onCreated,
}: {
  getAgents: () => Promise<SessionAgentItem[]>
  createSession: (args: { agentId: string }) => Promise<{ id: string }>
  onCreated: (id: string) => void
}) {
  const [agents, setAgents] = useState<SessionAgentItem[] | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    getAgents().then(data => {
      setAgents(data)
      setIsLoading(false)
    }).catch(() => setIsLoading(false))
  }, [getAgents])

  const handlePick = async (agentId: string) => {
    if (creating) return
    setCreating(true)
    try {
      const s = await createSession({ agentId })
      onCreated(s.id)
    } catch {
      setCreating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 p-3 space-y-2">
        {[1, 2].map(i => <div key={i} className="h-14 rounded-xl bg-surface-2 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1" style={{ scrollbarWidth: 'thin' }}>
      <p className="text-micro font-medium uppercase tracking-wide text-text-muted px-2 py-1">Choose an agent</p>
      {(agents ?? []).map(agent => (
        <button
          key={agent.id}
          onClick={() => handlePick(agent.id)}
          disabled={creating}
          className={`w-full flex items-center gap-3 p-3 rounded-xl text-left cursor-pointer ${ROW_ITEM} ${FOCUS_RING_INSET}`}
        >
          <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="text-small font-medium text-text-secondary">{agent.name}</p>
            <p className="text-micro text-text-muted font-mono truncate">
              {agent.models?.[0]?.split('/').pop() ?? ''}
            </p>
          </div>
        </button>
      ))}
    </div>
  )
}
