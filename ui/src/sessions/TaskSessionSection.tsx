import { Play, Square, Maximize2 } from 'lucide-react'
import { isRunPending, runNeedsPerson, runStateLabel } from '../tasks/runState'
import { RunStateBadge } from '../tasks/RunStateBadge'
import { CARD_CLICKABLE, DISABLED, withoutHover } from '../primitives/controlStyles'
import { BUTTON_SECONDARY } from '../primitives/buttonStyles'
import { Tooltip } from '../primitives/Tooltip'
import { useRefusal } from '../primitives/useRefusal'

// ── Prop interfaces ───────────────────────────────────────────────────────────

export interface TaskSessionSectionProps {
  task: {
    id: string
    assignedAgentId: string | null
    runState: string
    runStateReason?: string | null
  }
  /** The current task session record, or null if none exists yet. */
  taskSession: Record<string, unknown> | null
  onStart: () => void | Promise<void>
  onStop: () => void | Promise<void>
  /** Clears a failed or blocked run back to no run pending. Dismiss is shown only when this is given. */
  onDismiss?: () => void | Promise<void>
  actionBusy: boolean
  /** When set, Run and Dismiss are not offered and this is shown in their place: running again would only be refused. */
  runUnavailableReason?: string
  /** When set, the person only reads here: Run, Stop and Dismiss are not offered, and this is shown instead. */
  readOnlyReason?: string
  /** Called when the user clicks "View transcript" — opens the session detail view. */
  onViewTranscript?: (sessionId: string) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TaskSessionSection({
  task, taskSession, onStart, onStop, onDismiss, actionBusy, runUnavailableReason, readOnlyReason, onViewTranscript,
}: TaskSessionSectionProps) {
  const runState = task.runState
  const isBusy = isRunPending(runState)
  const isRunning = runState === 'RUN_ACTIVE'
  const needsPerson = runNeedsPerson(runState)
  const canRun = !!task.assignedAgentId
  // Running would only be refused, or the person only reads here: the control says it and a press opens the reason.
  const why = readOnlyReason ?? runUnavailableReason
  const refused = useRefusal(why ? { reason: why, title: readOnlyReason ? 'You can only read this' : 'This task cannot run now' } : undefined)

  const sessionRunCount = ((taskSession as any)?.AgentRun ?? []).length
  const lastEntry = [...((taskSession as any)?.entries ?? [])].reverse().find((e: any) => e.role === 'ASSISTANT')
  const lastSnippet: string | null = lastEntry?.content?.slice(0, 120) ?? null

  const handleViewTranscript = () => {
    const sessionId = (taskSession as any)?.id as string | undefined
    if (sessionId) onViewTranscript?.(sessionId)
  }

  return (
    <div>
      {/* A failed or blocked run: why, for the person who must act */}
      {needsPerson && task.runStateReason && (
        <div className={`mb-3 px-3 py-2.5 rounded-lg border text-small leading-relaxed ${
          runState === 'RUN_FAILED'
            ? 'bg-danger/10 border-danger/20 text-danger'
            : 'bg-warning/10 border-warning/20 text-warning'
        }`}>
          <p className="text-micro font-medium mb-1 opacity-70">
            {runStateLabel(runState)}
          </p>
          {task.runStateReason}
        </div>
      )}

      {/* Section header */}
      <div className="flex items-center gap-1.5 mb-2">
        <p className="text-micro font-medium uppercase tracking-wide text-text-muted/70 mr-auto">Session</p>
        <RunStateBadge state={runState} className="!py-0.5" />
        {needsPerson && onDismiss && !runUnavailableReason && !readOnlyReason && (
          <button
            type="button"
            onClick={() => void onDismiss()}
            disabled={actionBusy}
            title="Clear this run — nothing is pending until the task is run again"
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-micro font-medium ${BUTTON_SECONDARY}`}
          >
            Dismiss
          </button>
        )}
        {why ? (
          <Tooltip label={refused.tooltip ?? ''} wrap side="top">
            <button type="button" {...refused.props} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-micro font-medium ${withoutHover(BUTTON_SECONDARY)} ${DISABLED}`}>
              {isBusy ? <Square size={9} /> : <Play size={9} />}
              {isBusy ? 'Stop' : 'Run'}
            </button>
          </Tooltip>
        ) : isBusy ? (
          <button
            type="button"
            onClick={() => void onStop()}
            disabled={actionBusy}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-micro font-medium bg-danger/10 not-disabled:hover:bg-danger/20 text-danger border border-danger/20 disabled:opacity-40 transition-colors disabled:cursor-not-allowed disabled:shadow-none"
          >
            <Square size={9} />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onStart()}
            disabled={actionBusy || !canRun}
            title={!task.assignedAgentId ? 'Assign an agent first' : 'Run task'}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-micro font-medium ${BUTTON_SECONDARY}`}
          >
            <Play size={9} />
            Run
          </button>
        )}
      </div>

      {refused.dialog}

      {/* Session card */}
      <div
        onClick={handleViewTranscript}
        className={`w-full text-left bg-card border rounded-xl px-4 py-3.5 group ${
          taskSession ? `cursor-pointer ${CARD_CLICKABLE}` : 'cursor-default border-border'
        }`}
      >
        {taskSession ? (
          <>
            {/* Stats row */}
            <div className="flex items-center gap-1 mb-2 text-micro flex-wrap">
              <span className="text-text-muted/70">{sessionRunCount} run{sessionRunCount !== 1 ? 's' : ''}</span>
            </div>
            {/* Last message or running indicator */}
            {isRunning ? (
              <>
                <p className="text-micro text-text-muted italic">Running…</p>
                <div className="relative h-[2px] rounded-full overflow-hidden bg-surface-3 mt-2">
                  <div className="agent-loading-bar absolute inset-y-0 left-0 w-[30%] bg-gradient-to-r from-transparent via-accent to-transparent rounded-full" />
                </div>
              </>
            ) : lastSnippet ? (
              <p className="text-micro text-text-muted leading-relaxed line-clamp-2">{lastSnippet}</p>
            ) : (
              <p className="text-micro text-text-muted italic">No messages yet</p>
            )}
            {/* View transcript link */}
            <div className="flex items-center gap-1 mt-3 text-micro text-text-muted/70 group-hover:text-text-secondary transition-colors">
              <Maximize2 size={10} />
              View transcript
            </div>
          </>
        ) : (
          <p className="text-micro text-text-muted italic">No session yet — run the task to start one</p>
        )}
      </div>
    </div>
  )
}
