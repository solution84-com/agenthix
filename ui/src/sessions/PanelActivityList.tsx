import { useCallback, useEffect, useState } from 'react'
import { runStateClasses, runStateLabel } from '../tasks/runState'
import type { Socket } from 'socket.io-client'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  Square,
  ExternalLink,
  X,
  Trash2,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import type { TaskSession, TaskSessionRun } from './types'
import { useSiteSocketListener } from './socketHooks'
import { AgentAvatar } from './SessionComponents'
import { FOCUS_RING, ROW_CHOSEN } from '../primitives/controlStyles'
import { BUTTON_GHOST } from '../primitives/buttonStyles'

// ── Prop interfaces ──────────────────────────────────────────────────────────

export interface PanelActivityListQueries {
  getTaskSessions: (input: { taskId: string }) => Promise<TaskSession[]>
}

export interface PanelActivityListActions {
  stopTaskSession: (input: { sessionId: string }) => Promise<unknown>
  stopAllSessions: (input: { taskId: string }) => Promise<unknown>
  deleteTaskSession: (input: { sessionId: string }) => Promise<unknown>
}

export interface PanelActivityListProps {
  taskId: string
  socket: Socket | null
  queries: PanelActivityListQueries
  actions: PanelActivityListActions
  /** Open the chat view for this session id */
  onOpenChat?: (sessionId: string) => void
  /** Close the panel (e.g. small "X" button) */
  onClose?: () => void
  /** Navigate to a task — receives the task key (e.g. "NP-7") and project key */
  onNavigateToTask?: (taskKey: string, projectKey: string) => void
  mode?: 'panel' | 'full'
  onMaximizeToggle?: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: string | Date): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function durationMs(run: { startedAt: string | null; endedAt: string | null }): number | null {
  if (!run.startedAt || !run.endedAt) return null
  return new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function RunStatusIcon({ status, manifestStatus }: { status: string; manifestStatus?: string | null }) {
  if (manifestStatus === 'PENDING_APPROVAL') return (
    <Clock className="w-3.5 h-3.5 text-warning shrink-0" />
  )
  if (status === 'RUNNING' || status === 'PENDING') return (
    <Loader2 className="w-3.5 h-3.5 text-text-secondary animate-spin shrink-0" />
  )
  if (status === 'COMPLETED') return (
    <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
  )
  if (status === 'FAILED') return (
    <XCircle className="w-3.5 h-3.5 text-danger shrink-0" />
  )
  if (status === 'CANCELLED') return (
    <Ban className="w-3.5 h-3.5 text-text-muted shrink-0" />
  )
  return <Clock className="w-3.5 h-3.5 text-text-muted/70 shrink-0" />
}


// ── ActivityItem ─────────────────────────────────────────────────────────────

function ActivityItem({
  session,
  actions,
  onOpenSession,
  onNavigateTask,
}: {
  session: TaskSession
  actions: PanelActivityListActions
  onOpenSession: (sessionId: string) => void
  onNavigateTask: (taskKey: string) => void
}) {
  const [stopping, setStopping] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const latestRun: TaskSessionRun | null = session.AgentRun[0] ?? null
  const isActive = (latestRun?.status === 'RUNNING' || latestRun?.status === 'PENDING')
    && latestRun?.manifestStatus !== 'PENDING_APPROVAL'
  const ms = latestRun ? durationMs(latestRun) : null

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setStopping(true)
    try { await actions.stopTaskSession({ sessionId: session.id }) } finally { setStopping(false) }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleting(true)
    try { await actions.deleteTaskSession({ sessionId: session.id }) } finally { setDeleting(false) }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${session.agent?.name ?? 'the agent'}'s session${session.task ? `: ${session.task.title}` : ''}`}
      onClick={() => onOpenSession(session.id)}
      onKeyDown={e => {
        // Only the row's own keys: Enter on its Stop or Delete button is that button's.
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        onOpenSession(session.id)
      }}
      className={`px-3 py-2.5 border-b border-border-subtle transition-colors cursor-pointer group ${FOCUS_RING} ${
        isActive ? ROW_CHOSEN : 'hover:bg-surface-hover active:bg-surface-pressed'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Run status icon */}
        <div className="mt-0.5 shrink-0">
          {latestRun
            ? <RunStatusIcon status={latestRun.status} manifestStatus={latestRun.manifestStatus} />
            : <Clock className="w-3.5 h-3.5 text-text-muted/70 shrink-0" />}
        </div>

        <div className="flex-1 min-w-0">
          {/* Agent + time */}
          <div className="flex items-center gap-1.5 mb-0.5">
            {session.agent && <AgentAvatar name={session.agent.name} avatarUrl={session.agent.avatarUrl} size="sm" />}
            <span className="text-small font-medium text-text-secondary truncate">
              {session.agent?.name ?? 'Unknown'}
            </span>
            <span className="text-micro text-text-muted/70 ml-auto shrink-0">
              {timeAgo(session.updatedAt)}
            </span>
          </div>

          {/* Title — task title */}
          {session.task && (
            <p className="text-micro text-text-secondary truncate leading-relaxed group-hover:text-text-primary transition-colors">
              {session.task.title}
            </p>
          )}

          {/* Run state + duration + task link */}
          <div className="flex items-center gap-2 mt-0.5">
            {session.task && runStateLabel(session.task.runState) && (
              <span className={`text-micro font-medium px-1.5 rounded ${runStateClasses(session.task.runState)}`}>
                {runStateLabel(session.task.runState)}
              </span>
            )}
            {ms !== null && (
              <span className="text-micro text-text-muted/70 tabular-nums">{formatDuration(ms)}</span>
            )}
            {session.task && (
              <button
                onClick={e => {
                  e.stopPropagation()
                  onNavigateTask(`${session.task!.project.key}-${session.task!.number}`)
                }}
                title="Open task"
                className={`ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-micro opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0 ${BUTTON_GHOST}`}
              >
                <ExternalLink className="w-2.5 h-2.5" />
                Task
              </button>
            )}
          </div>
        </div>

        {/* Right-side action: stop when active, delete on hover when inactive */}
        {isActive ? (
          <button
            onClick={handleStop}
            disabled={stopping}
            className="shrink-0 mt-0.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-danger/10 not-disabled:hover:bg-danger/20 text-danger text-micro font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            title="Stop this run"
          >
            {stopping ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Square className="w-2.5 h-2.5 fill-current" />}
          </button>
        ) : (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="shrink-0 mt-0.5 p-1 rounded text-text-muted/70 not-disabled:hover:text-danger not-disabled:hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-40 opacity-0 group-hover:opacity-100 disabled:cursor-not-allowed disabled:shadow-none"
            title="Delete session"
          >
            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  )
}

// ── PanelActivityList ─────────────────────────────────────────────────────────

export function PanelActivityList({
  taskId,
  socket,
  queries,
  actions,
  onOpenChat,
  onClose,
  onNavigateToTask,
  onMaximizeToggle,
  mode,
}: PanelActivityListProps) {
  const [sessions, setSessions] = useState<TaskSession[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(async () => {
    const r = await queries.getTaskSessions({ taskId })
    setSessions(r)
    setIsLoading(false)
  }, [queries, taskId])

  useEffect(() => { void refetch() }, [refetch])

  const [stoppingAll, setStoppingAll] = useState(false)

  const onRunStatus = useCallback(() => { void refetch() }, [refetch])
  useSiteSocketListener<{ runId: string; status: string }>(socket, 'agentRunStatus', onRunStatus)

  const sessionList = sessions
  const activeCount = sessionList.filter(s => {
    const run = s.AgentRun[0]
    return (run?.status === 'RUNNING' || run?.status === 'PENDING')
      && run?.manifestStatus !== 'PENDING_APPROVAL'
  }).length

  const handleStopAll = async () => {
    setStoppingAll(true)
    try { await actions.stopAllSessions({ taskId }) } finally { setStoppingAll(false) }
  }

  const handleNavigateTask = useCallback((taskKey: string) => {
    // Extract project key from taskKey (e.g. "NP-7" → "NP")
    const projectKey = taskKey.split('-')[0] ?? ''
    onNavigateToTask?.(taskKey, projectKey)
    onClose?.()
  }, [onNavigateToTask, onClose])

  const isFullMode = mode === 'full'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-12 border-b border-border shrink-0">
        <span className="text-body font-medium text-text-primary flex-1">Activity</span>
        {activeCount > 0 && (
          <span className="flex items-center gap-1 bg-chip text-text-secondary px-2 py-0.5 rounded-full text-micro font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-text-primary animate-pulse" />
            {activeCount} active
          </span>
        )}
        <button
          onClick={handleStopAll}
          disabled={stoppingAll || activeCount === 0}
          title={activeCount === 0 ? 'No active runs' : 'Stop all active runs'}
          className="flex items-center gap-1 px-2 py-1 rounded text-micro font-medium transition-colors disabled:cursor-not-allowed cursor-pointer bg-danger/10 not-disabled:hover:bg-danger/20 text-danger disabled:opacity-40 disabled:shadow-none"
        >
          {stoppingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3 fill-current" />}
          Stop all
        </button>
        {onMaximizeToggle && (
          <button
            onClick={onMaximizeToggle}
            className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            title={isFullMode ? 'Restore panel' : 'Expand panel'}
          >
            {isFullMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
        <button onClick={onClose} className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer ml-1">
          <X size={15} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-small text-text-muted">Loading…</p>
          </div>
        ) : sessionList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
            <p className="text-small text-text-muted">No task activity yet</p>
            <p className="text-micro text-text-muted/70">Agent task sessions will appear here in real time</p>
          </div>
        ) : (
          sessionList.map(s => (
            <ActivityItem
              key={s.id}
              session={s}
              actions={actions}
              onOpenSession={id => onOpenChat?.(id)}
              onNavigateTask={handleNavigateTask}
            />
          ))
        )}
      </div>
    </div>
  )
}
