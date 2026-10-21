import {
  useQuery, useAction, getTaskByKey, getTaskSession, triggerAgentRun, approveManifest, rejectManifest, tryAgain,
  sendWaitingMessageNow, cancelWaitingMessage,
} from 'wasp/client/operations'
import { useSocket } from 'wasp/client/webSocket'
import { TaskSessionView, type SessionRunInfo } from '@agenthix/ui/tasks'
import { type TranscriptEntry } from '@agenthix/ui/sessions'
import { MarkdownMessage } from '../../shared/components/MarkdownMessage'
import { useConversationLinks } from '../../shared/components/ChatPanel/useConversationLinks'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'

/** While a run is going or waiting the transcript is read again this often. */
const SESSION_REFRESH_MS = 4_000

interface SessionData {
  id: string
  entries: TranscriptEntry[]
  conversation?: { latestFailure: { runId: string | null } | null }
  AgentRun: { id: string; status: string; createdAt: string | Date; endedAt: string | Date | null; startedBy: string | null }[]
}

/**
 * A task's session inside the tools panel (every screen reviewed spec §3): the whole transcript drawn as a
 * conversation draws it, each run a divider, and a box that sends into it through the run action. The main pane
 * and the breadcrumb do not change.
 */
export function TaskSessionPane({ taskKey, onBack }: { taskKey: string; onBack?: () => void }) {
  const { data: byKey } = useQuery(getTaskByKey, { taskKey })
  const task = byKey
  const going = !!task && ['RUN_ACTIVE', 'RUN_QUEUED', 'RUN_THROTTLED', 'RUN_BLOCKED'].includes(task.runState)
  const { data: sessionData, isLoading, refetch } = useQuery(
    getTaskSession, task ? { taskId: task.id } : undefined, { enabled: !!task, refetchInterval: going ? SESSION_REFRESH_MS : false },
  )
  const session: SessionData | null | undefined = sessionData
  const { socket } = useSocket()
  const sendFn = useAction(triggerAgentRun)
  const approveFn = useAction(approveManifest)
  const rejectFn = useAction(rejectManifest)
  const tryAgainFn = useAction(tryAgain)
  const sendNowFn = useAction(sendWaitingMessageNow)
  const cancelWaitingFn = useAction(cancelWaitingMessage)
  const canStart = useMayWork(task?.projectId)
  const links = useConversationLinks(session?.id ?? '')

  const agentName = task?.assignedAgent?.name ?? 'the agent'
  const runs: SessionRunInfo[] = (session?.AgentRun ?? []).map(r => ({ id: r.id, status: r.status, createdAt: r.createdAt, endedAt: r.endedAt, startedBy: r.startedBy }))
  const waitingRunId = session?.entries.find(e => e.approvalCard?.answer === 'waiting')?.runId ?? null
  const runningRunId = task?.runState === 'RUN_ACTIVE' ? session?.AgentRun.at(-1)?.id ?? null : null

  return (
    <TaskSessionView
      backLabel={onBack ? taskKey : undefined}
      onBack={onBack}
      summary={`${taskKey} · ${agentName} · ${runs.length} run${runs.length === 1 ? '' : 's'}`}
      agentName={agentName}
      sessionId={session?.id ?? null}
      socket={socket as never}
      entries={session?.entries ?? []}
      runs={runs}
      refetch={() => refetch().then(r => (r.data as SessionData | null | undefined) ?? { entries: [] })}
      runningRunId={runningRunId}
      waitingRunId={waitingRunId}
      latestFailureRunId={session?.conversation?.latestFailure?.runId ?? null}
      loading={isLoading || !task}
      recordActions={canStart && session ? {
        approvalActions: { approveManifest: approveFn as never, rejectManifest: rejectFn as never },
        onSendNow: (runId: string) => sendNowFn({ sessionId: session.id, runId } as never),
        onCancelWaiting: (runId: string) => cancelWaitingFn({ sessionId: session.id, runId } as never),
        onTryAgain: () => void tryAgainFn({ sessionId: session.id } as never),
      } : undefined}
      links={{ onOpenRun: links.onOpenRun, onOpenTarget: links.onOpenTarget, canOpenTarget: links.canOpenTarget }}
      renderMarkdown={p => <MarkdownMessage content={p.content} className={p.className} />}
      readOnlyReason={canStart ? undefined : VIEWER_CANNOT_WORK}
      sendDisabledReason={!session ? 'There is no session yet. Run the task to start one.' : undefined}
      onSend={async text => { if (session) await sendFn({ sessionId: session.id, inputText: text }) }}
    />
  )
}
