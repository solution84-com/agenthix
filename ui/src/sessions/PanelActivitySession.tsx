import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Socket } from 'socket.io-client'
import type { WorkTarget } from '@agenthix/core'
import { ArrowLeft, X, ExternalLink, Maximize2, Minimize2 } from 'lucide-react'
import { AgentAvatar } from './SessionComponents'
import { SessionTranscript } from './SessionTranscript'
import { SessionUsageButton, sessionTotals } from './SessionUsageButton'
import type { ActivitySessionDetail, RenderMarkdown } from './types'
import { MODEL_PRICING } from '../agents/aiMetrics'

export interface PanelActivitySessionQueries {
  getActivitySession: (input: { sessionId: string }) => Promise<ActivitySessionDetail>
}

export interface PanelActivitySessionProps {
  sessionId: string
  socket: Socket | null
  /** Whether the socket is currently connected — used for the status indicator. */
  isConnected?: boolean
  queries: PanelActivitySessionQueries
  /** Optional controls bar at the top — site renders <AgentControlsBar />, HQ may pass null */
  controlsBar?: ReactNode
  renderMarkdown?: RenderMarkdown
  onBack?: () => void
  onClose?: () => void
  onMaximizeToggle?: () => void
  isFullMode?: boolean
  /** Where "Open task" button navigates. Receives taskKey (e.g. "PROJ-4") and projectKey. */
  onNavigateToTask?: (taskKey: string, projectKey: string) => void
  /** Where Details and "Open the run" go. */
  onOpenRun?: (runId: string) => void
  onOpenTarget?: (target: WorkTarget) => boolean | void
  canOpenTarget?: (target: WorkTarget) => boolean
}

/** A session read-only: its record as a conversation draws it, with the run in progress live. */
export function PanelActivitySession({
  sessionId, socket, isConnected = false, queries, controlsBar, renderMarkdown, onBack, onClose, onMaximizeToggle, isFullMode,
  onNavigateToTask, onOpenRun, onOpenTarget, canOpenTarget,
}: PanelActivitySessionProps) {
  const [session, setSession] = useState<ActivitySessionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(() => queries.getActivitySession({ sessionId }).then(data => {
    setSession(data)
    return data
  }), [queries, sessionId])

  useEffect(() => {
    setIsLoading(true)
    queries.getActivitySession({ sessionId }).then(data => {
      setSession(data)
      setIsLoading(false)
    })
  }, [queries, sessionId])

  const agentName = session?.agent?.name ?? 'Agent'
  const avatarUrl = session?.agent?.avatarUrl ?? null
  const taskNumber = session?.task?.number ?? null
  const taskProjectKey = session?.task?.project?.key ?? null
  const taskKey = taskNumber !== null && taskProjectKey ? `${taskProjectKey}-${taskNumber}` : null
  const sessionTitle = session?.task?.title ?? 'Session'
  const sessionModel = session?.model ?? ''
  const latestRun = session?.AgentRun?.[0]
  const running = latestRun && (latestRun.status === 'RUNNING' || latestRun.status === 'PENDING') && latestRun.manifestStatus !== 'PENDING_APPROVAL'
    ? latestRun.id : null

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <button onClick={onBack} className="cursor-pointer p-1 text-text-muted transition-colors hover:text-text-primary" title="Back to activity">
          <ArrowLeft size={16} />
        </button>
        {!isLoading && <AgentAvatar name={agentName} avatarUrl={avatarUrl} size="sm" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold leading-tight text-text-primary">{agentName}</p>
          <p className="flex items-center gap-1 truncate text-micro leading-tight text-text-muted">{sessionTitle}</p>
        </div>
        <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${isConnected ? 'bg-success' : 'bg-warning'}`} />
        <SessionUsageButton total={sessionTotals(session)} model={MODEL_PRICING[sessionModel] ? sessionModel : ''} />
        {taskKey && (
          <button
            onClick={() => onNavigateToTask?.(taskKey, taskProjectKey!)}
            title="Open task"
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-border px-2 py-1 text-micro text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
          >
            <ExternalLink size={10} />
            Task
          </button>
        )}
        {onMaximizeToggle && (
          <button onClick={onMaximizeToggle} className="cursor-pointer p-1 text-text-muted transition-colors hover:text-text-primary" title={isFullMode ? 'Restore panel' : 'Expand panel'}>
            {isFullMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
        <button onClick={onClose} className="cursor-pointer p-1 text-text-muted transition-colors hover:text-text-primary">
          <X size={15} />
        </button>
      </div>

      {controlsBar}

      {isLoading || !session ? (
        <div className="flex flex-1 items-center justify-center"><p className="text-small text-text-muted">Loading…</p></div>
      ) : (
        <SessionTranscript
          sessionId={sessionId}
          socket={socket}
          entries={session.entries}
          refetch={refetch}
          runningRunId={running}
          latestFailureRunId={session.conversation?.latestFailure?.runId ?? null}
          agentName={agentName}
          avatarUrl={avatarUrl}
          renderMarkdown={renderMarkdown}
          actions={{ onOpenRun, onOpenTarget, canOpenTarget: canOpenTarget ?? (() => false) }}
          emptyState={
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <AgentAvatar name={agentName} avatarUrl={avatarUrl} size="sm" />
              <p className="text-small text-text-muted">No activity yet</p>
            </div>
          }
        />
      )}
    </div>
  )
}
