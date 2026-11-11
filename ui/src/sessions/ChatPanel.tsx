import { useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { MessageSquare, Plus, Maximize2, Minimize2, X } from 'lucide-react'
import { PanelSessionList } from './PanelSessionList'
import { PanelChatView } from './PanelChatView'
import type { PanelSessionListQueries, PanelSessionListActions } from './PanelSessionList'
import type { PanelChatViewQueries, PanelChatViewActions } from './PanelChatView'
import type { RenderMarkdown } from './types'
import { AgentAvatar } from './SessionComponents'
import { BUTTON_GHOST } from '../primitives/buttonStyles'

/**
 * Width-responsive master-detail chat panel.
 *
 * TWO-PANE  (panelWidth >= TWO_PANE_BREAKPOINT, or panelMode === 'full'):
 *   Session list on the left, chat view on the right — always visible together.
 *
 * SINGLE-PANE  (panelWidth < TWO_PANE_BREAKPOINT):
 *   Master-detail navigation: list → select session → chat view (back to return).
 *
 * All Wasp/router/sidebar context is replaced with explicit props so this
 * component is usable in any host (site, hq/client, etc.).
 */

const TWO_PANE_BREAKPOINT = 900

export interface ChatPanelQueries extends PanelSessionListQueries, PanelChatViewQueries {}

export interface ChatPanelActions extends PanelChatViewActions {
  createSession?: PanelSessionListActions['createSession']
}

export interface ChatPanelProps {
  socket: Socket | null
  queries: ChatPanelQueries
  actions: ChatPanelActions
  renderMarkdown?: RenderMarkdown
  /** Active session id from outside (may be null when nothing is selected) */
  activeSessionId: string | null
  onSelectSession: (sessionId: string | null) => void
  /** Current panel width (px) — used for the two-pane breakpoint */
  panelWidth: number
  /** 'panel' | 'full' mode for the embedded chat view */
  panelMode: 'panel' | 'full'
  onTogglePanelMode: () => void
  onClose?: () => void
  /**
   * When true, the panel is rendered alongside a dedicated /sessions/:id page.
   * In single-pane mode this causes session selection to call onNavigateToSession
   * instead of onSelectSession (site-only behaviour, equivalent to useMatch('/sessions/:id')).
   */
  dedicatedSessionPage?: boolean
  /** Called in single-pane + dedicatedSessionPage mode when a session is selected */
  onNavigateToSession?: (sessionId: string) => void
}

export function ChatPanel({
  socket,
  queries,
  actions,
  renderMarkdown,
  activeSessionId,
  onSelectSession,
  panelWidth,
  panelMode,
  onTogglePanelMode,
  onClose,
  dedicatedSessionPage = false,
  onNavigateToSession,
}: ChatPanelProps) {
  const isFullMode = panelMode === 'full'
  const isTwoPane = isFullMode || panelWidth >= TWO_PANE_BREAKPOINT
  const chatMode = isFullMode ? 'full' : 'panel'

  // Auto-select first active session when entering 2-pane with nothing selected
  const [autoSelectSessions, setAutoSelectSessions] = useState<any[] | undefined>(undefined)
  useEffect(() => {
    if (!isTwoPane || activeSessionId) return
    queries.getSessions().then(s => setAutoSelectSessions(s as any[])).catch(() => {})
  }, [isTwoPane, activeSessionId])

  useEffect(() => {
    if (!isTwoPane || activeSessionId) return
    const first = autoSelectSessions?.find((s: any) => s.status === 'ACTIVE')
    if (first) onSelectSession(first.id)
  }, [isTwoPane, activeSessionId, autoSelectSessions])

  // Fetch active session info for the unified app bar (two-pane only)
  const [activeSessionData, setActiveSessionData] = useState<any | undefined>(undefined)
  useEffect(() => {
    if (!isTwoPane || !activeSessionId) { setActiveSessionData(undefined); return }
    queries.getSession({ id: activeSessionId }).then(s => setActiveSessionData(s)).catch(() => {})
  }, [isTwoPane, activeSessionId])

  // Build the PanelSessionListActions (createSession may be absent)
  const sessionListActions: PanelSessionListActions = {
    createSession: actions.createSession ?? (async () => { throw new Error('createSession not provided') }),
  }

  // ── Two-pane: unified app bar + session list left + chat right ──
  if (isTwoPane) {
    const agentName = (activeSessionData as any)?.agent?.name ?? 'Agent'
    const sessionTitle = (activeSessionData as any)?.title
    const avatarUrl = (activeSessionData as any)?.agent?.avatarUrl

    return (
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden h-full">
        {/* Unified app bar spanning full width */}
        <div className="flex h-12 shrink-0 border-b border-border items-center">
          {/* Left section — aligns with session list column */}
          <div className="w-72 flex-shrink-0 flex items-center gap-2 px-4 border-r border-border-subtle h-full">
            <MessageSquare size={15} className="text-text-muted" />
            <span className="text-body font-medium text-text-primary flex-1">Sessions</span>
            <button
              onClick={() => onSelectSession(null)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-micro font-medium cursor-pointer ${BUTTON_GHOST}`}
              title="New session"
            >
              <Plus size={13} />
              New
            </button>
          </div>

          {/* Right section — aligns with chat column */}
          <div className="flex-1 min-w-0 flex items-center gap-2 px-3 h-full">
            {activeSessionId && <AgentAvatar name={agentName} avatarUrl={avatarUrl} size="sm" />}
            <span className="text-body font-medium text-text-primary flex-1 truncate min-w-0">
              {activeSessionId
                ? (sessionTitle ? `${agentName}: ${sessionTitle}` : agentName)
                : 'Select a session'}
            </span>
            <button
              onClick={onTogglePanelMode}
              className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
              title={isFullMode ? 'Restore panel' : 'Expand panel'}
            >
              {isFullMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={onClose}
              className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Two-column content — no individual headers */}
        <div className="flex flex-1 min-w-0 overflow-hidden">
          <div className="w-72 flex-shrink-0 border-r border-border-subtle overflow-hidden flex flex-col">
            <PanelSessionList
              activeSessionId={activeSessionId}
              queries={queries}
              actions={sessionListActions}
              onSelectSession={onSelectSession}
              hideHeader
            />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
            {activeSessionId ? (
              <PanelChatView
                sessionId={activeSessionId}
                socket={socket}
                queries={queries}
                actions={actions}
                renderMarkdown={renderMarkdown}
                mode={chatMode}
                hideHeader
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                <MessageSquare size={28} className="text-text-muted/70" />
                <p className="text-body text-text-muted">Select a session to start chatting</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Single-pane: master-detail navigation ──
  return (
    <div className="flex flex-col h-full">
      {dedicatedSessionPage ? (
        <PanelSessionList
          activeSessionId={activeSessionId}
          queries={queries}
          actions={sessionListActions}
          onSelectSession={(sid) => { onNavigateToSession ? onNavigateToSession(sid) : onSelectSession(sid) }}
          onMaximizeToggle={onTogglePanelMode}
          isFullMode={isFullMode}
        />
      ) : activeSessionId ? (
        <PanelChatView
          sessionId={activeSessionId}
          socket={socket}
          queries={queries}
          actions={actions}
          renderMarkdown={renderMarkdown}
          onBack={() => onSelectSession(null)}
          onMaximizeToggle={onTogglePanelMode}
        />
      ) : (
        <PanelSessionList
          activeSessionId={activeSessionId}
          queries={queries}
          actions={sessionListActions}
          onSelectSession={onSelectSession}
          onMaximizeToggle={onTogglePanelMode}
          isFullMode={isFullMode}
        />
      )}
    </div>
  )
}
