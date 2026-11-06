import { useState } from 'react'
import {
  useQuery, useAction, getTaskSession, getTaskRuns, approveManifest, rejectManifest, tryAgain, stopTask,
} from 'wasp/client/operations'
import { useSocket } from 'wasp/client/webSocket'
import type { SessionRunInfo, TaskRunsTimelineProps } from '@agenthix/ui/tasks'
import type { TranscriptEntry } from '@agenthix/ui/sessions'
import { useConversationLinks } from '../../shared/components/ChatPanel/useConversationLinks'
import { useAttention } from '../../shared/components/AttentionDialog'
import { refusalText } from '../../shared/refusal'

/** While a run is going or waiting the record is read again this often. */
const SESSION_REFRESH_MS = 4_000

const GOING = ['RUN_ACTIVE', 'RUN_QUEUED', 'RUN_THROTTLED', 'RUN_BLOCKED']

/** What a run waiting for an okay says to someone who may not give it, such as a project Viewer: who can. */
export const VIEWER_WAITING_LINE = 'Waiting for a Member or Admin of this project to okay it'
export const VIEWER_WAITING_FOR = 'Waiting for a Member or Admin of this project to answer'

interface SessionData {
  id: string
  entries: TranscriptEntry[]
  conversation?: { latestFailure: { runId: string | null } | null }
  AgentRun: { id: string; status: string; createdAt: string | Date; endedAt: string | Date | null; startedBy: string | null }[]
}

/** What HQ keeps of each run (getTaskRuns): the number it was given when it started, what it stated, and its error. */
interface StoredRun { id: string; number: number | null; result: string | null; error: string | null }

export interface TaskRunsTask {
  id: string
  runState: string
  assignedAgent?: { name: string; avatarUrl?: string | null } | null
}

/**
 * A task's runs for its timeline: the session's runs and record (getTaskSession) with each run's stored number,
 * stated result and error (getTaskRuns), and Stop. A stop that fails opens the attention dialog with Try again.
 */
export function useTaskRuns(task: TaskRunsTask | null | undefined, canAct: boolean) {
  const going = !!task && GOING.includes(task.runState)
  const { data: sessionData, isLoading, refetch } = useQuery(
    getTaskSession, task ? { taskId: task.id } : undefined, { enabled: !!task, refetchInterval: going ? SESSION_REFRESH_MS : false },
  )
  const { data: stored } = useQuery(getTaskRuns, task ? { taskId: task.id, stored: true } : undefined, { enabled: !!task, refetchInterval: going ? SESSION_REFRESH_MS : false })
  const session = sessionData as SessionData | null | undefined
  const { socket } = useSocket()
  const approveFn = useAction(approveManifest)
  const rejectFn = useAction(rejectManifest)
  const tryAgainFn = useAction(tryAgain)
  const stopFn = useAction(stopTask)
  const links = useConversationLinks(session?.id ?? '')
  const attention = useAttention()
  const [stopping, setStopping] = useState(false)

  const byId = new Map(((stored ?? []) as StoredRun[]).map(r => [r.id, r]))
  const runs: SessionRunInfo[] = (session?.AgentRun ?? []).map(r => {
    const s = byId.get(r.id)
    return { ...r, number: s?.number ?? null, result: s?.result ?? null, error: s?.error ?? null }
  })
  const waitingRunId = session?.entries.find(e => e.approvalCard?.answer === 'waiting')?.runId ?? null
  const runningRunId = task?.runState === 'RUN_ACTIVE' ? session?.AgentRun.at(-1)?.id ?? null : null

  const stop = async () => {
    if (!task) return
    setStopping(true)
    try {
      await stopFn({ taskId: task.id })
      await refetch()
    } catch (err) {
      attention.show({ title: 'Could not stop the run', text: refusalText(err), retry: () => void stop() })
    } finally {
      setStopping(false)
    }
  }

  const timeline: TaskRunsTimelineProps = {
    agentName: task?.assignedAgent?.name ?? 'the agent',
    avatarUrl: task?.assignedAgent?.avatarUrl ?? null,
    sessionId: session?.id ?? null,
    socket: socket as never,
    entries: session?.entries ?? [],
    runs,
    refetch: () => refetch().then(r => (r.data as SessionData | null | undefined) ?? { entries: [] }),
    runningRunId,
    waitingRunId,
    latestFailureRunId: session?.conversation?.latestFailure?.runId ?? null,
    loading: isLoading || !task,
    recordActions: canAct && session ? {
      approvalActions: { approveManifest: approveFn as never, rejectManifest: rejectFn as never },
      onTryAgain: () => void tryAgainFn({ sessionId: session.id } as never),
    } : undefined,
    links: { onOpenRun: links.onOpenRun, onOpenTarget: links.onOpenTarget, canOpenTarget: links.canOpenTarget, skillLabel: links.skillLabel },
    onStop: canAct ? () => void stop() : undefined,
    waitingLine: canAct ? undefined : VIEWER_WAITING_LINE,
    approvalWaitingFor: canAct ? undefined : VIEWER_WAITING_FOR,
    stopping,
  }
  return { timeline, runCount: runs.length, dialog: attention.dialog }
}
