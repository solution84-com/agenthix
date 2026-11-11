import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  useQuery, useAction,
  getTaskByKey, getTaskSession, getSessionPendingManifest, getNotifications, getMyRuns,
  approveManifest, rejectManifest,
} from 'wasp/client/operations'
import type { PendingManifestData, TranscriptEntry } from '@agenthix/ui/sessions'
import { PanelGroupHeading, PanelItemAction, FOCUS_RING } from '@agenthix/ui/primitives'
import { whenText } from '../RunsPanel/panelTime'
import { PanelHead } from './PanelHead'
import { RequestCommand } from './RequestCommand'
import { ShowAttention } from '@agenthix/ui/attention'
import { ReadFailed } from '../../siteRead'

type TaskByKey = { id: string; title: string; assignedAgent: { name: string } | null; project: { name: string } }
type TaskSession = {
  id: string
  entries: TranscriptEntry[]
  AgentRun: { id: string; createdAt: string | Date; endedAt: string | Date | null }[]
}

const DENIED_REASON = 'Denied'

/**
 * A task's tool request, inside the panel it was opened from (spec §6): the
 * task, its agent and place, which run and since when; what it wants to run;
 * why, in the agent's own words; Approve, Deny and a way to the task. After an
 * answer it returns to the list — and the request leaves both panels, here and
 * for anyone else it went to.
 */
export function ApprovalRequestView({ taskKey, from, onBack }: { taskKey: string; from: string; onBack: () => void }) {
  const navigate = useNavigate()
  const { data: taskData, error: taskError, refetch: refetchTask } = useQuery(getTaskByKey, { taskKey })
  const task: TaskByKey | undefined = taskData
  const { data: sessionData, error: sessionError, refetch: refetchSession } = useQuery(getTaskSession, task ? { taskId: task.id } : undefined, { enabled: !!task })
  const session: TaskSession | null | undefined = sessionData
  const { data: pendingData, isLoading, error: pendingError, refetch: refetchPending } = useQuery(
    getSessionPendingManifest, session ? { sessionId: session.id } : undefined, { enabled: !!session },
  )
  const pending = (pendingData ?? null) as PendingManifestData | null
  const { refetch: refetchNotifications } = useQuery(getNotifications)
  const { refetch: refetchRuns } = useQuery(getMyRuns)
  const approve = useAction(approveManifest)
  const reject = useAction(rejectManifest)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const answer = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await Promise.all([refetchNotifications(), refetchRuns()])
      onBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The answer was not taken')
    } finally {
      setBusy(false)
    }
  }

  const runs = session?.AgentRun ?? []
  const runIndex = pending ? runs.findIndex(r => r.id === pending.runId) : -1
  const run = runIndex >= 0 ? runs[runIndex] : null
  const facts = [
    task?.assignedAgent?.name,
    task?.project.name,
    runIndex >= 0 ? `run ${runIndex + 1}` : null,
    run ? `waiting since ${whenText(run.endedAt ?? run.createdAt)}` : null,
  ].filter(Boolean).join(' · ')
  const lastMessage = [...(session?.entries ?? [])].reverse().find(e => e.role === 'ASSISTANT' && e.content.trim())?.content
  const why = pending?.summary?.trim() || lastMessage?.trim() || null
  const wants = pending
    ? [
        ...pending.pendingManifest.bashPatterns.map(p => p.pattern).filter((p): p is string => !!p),
        ...pending.pendingManifest.tools.map(t => t.name).filter((t): t is string => !!t),
      ]
    : []
  const openTask = () => navigate(`/tasks/${taskKey}`)

  return (
    <div className="flex flex-col h-full">
      <PanelHead title={taskKey} back={from} onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: 'thin' }}>
        {taskError && !task ? (
          <ReadFailed error={taskError} what="This task" retry={() => { void refetchTask() }} />
        ) : task && pendingData === undefined && (sessionError || pendingError) ? (
          // Not "answered": the request could not be read.
          <ReadFailed error={sessionError ?? pendingError} what="This request" retry={() => { void refetchSession(); void refetchPending() }} />
        ) : !task || (isLoading && !pending) ? (
          <p className="py-8 text-center text-small text-text-muted">Loading…</p>
        ) : (
          <>
            <h2 className="mt-3 text-h3 font-medium text-text-primary">{task.title}</h2>
            {facts && <p className="text-micro text-text-muted">{facts}</p>}
            {!pending ? (
              <p className="mt-4 text-small text-text-secondary">This request has been answered, or the run has moved on.</p>
            ) : (
              <>
                <div className="-mx-3"><PanelGroupHeading label="It wants to run" /></div>
                <div className="flex flex-col gap-2">{wants.map((w, i) => <RequestCommand key={i} text={w} />)}</div>
                {why && (
                  <>
                    <div className="-mx-3"><PanelGroupHeading label="Why" /></div>
                    <p className="whitespace-pre-wrap text-body text-text-primary">{why}</p>
                  </>
                )}
                {error && <ShowAttention kind="alert" text={error} />}
                <div className="mt-4 flex items-center gap-2">
                  <PanelItemAction look="primary" disabled={busy} onClick={() => answer(() => approve({ runId: pending.runId, sessionId: pending.sessionId }))}>
                    Approve
                  </PanelItemAction>
                  <PanelItemAction disabled={busy} onClick={() => answer(() => reject({ runId: pending.runId, reason: DENIED_REASON, sessionId: pending.sessionId }))}>
                    Deny
                  </PanelItemAction>
                </div>
              </>
            )}
            <button type="button" onClick={openTask} className={`rounded mt-4 text-small text-link hover:underline ${FOCUS_RING}`}>
              Open the task ›
            </button>
          </>
        )}
      </div>
    </div>
  )
}
