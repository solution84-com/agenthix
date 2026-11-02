import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ListPlus, MessageSquarePlus } from 'lucide-react'
import { Link } from 'react-router'
import { useAction, useQuery, getAgents, getTaskConversation, markConversationRead, startWorkspaceConversation } from 'wasp/client/operations'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'
import type { ConversationAgentView } from '../../shared/conversations/protocol'
import type { ThreadActivity } from '../../conversations/components/ConversationThread'
import type { BranchLineView } from '../../branches/views'
import { VIEWER_REASON } from '../words'
import { TaskFirstMessage } from '../../projects/components/TaskThreadSection'

const ConversationThread = lazy(() => import('../../conversations/components/ConversationThread').then(m => ({ default: m.ConversationThread })))

const loading = <p className="px-4 py-6 text-small text-text-muted">Loading…</p>

/**
 * The conversation beside the middle (spec part 1, *Layout* 6), with the existing thread: a conversation's branch shows
 * that conversation, a task's branch the task's thread (with the box that starts it, when it has none yet). `main` has none of its own; *New conversation* starts one in
 * this workspace, which makes its own branch at its first run, and it shows here until then.
 */
export function ConversationPanel({ workspaceId, workspaceName, git, line, listPath, canAct, pending, onStarted, onActivity, onTaskThread, onNewTask, pendingTask }: {
  workspaceId: string
  workspaceName: string
  /** Whether the workspace has Git: without it there is no `main` and no branch, and a conversation works in its files. */
  git: boolean
  /** The chosen branch; null for `main`. */
  line: BranchLineView | null
  listPath: string
  canAct: boolean
  /** A conversation started from `main` that has no branch yet. */
  pending: string | null
  onStarted: (conversationId: string) => void
  onActivity: (activity: ThreadActivity) => void
  /** Told which conversation is a task's thread while its branch shows, and null when it no longer shows. */
  onTaskThread?: (conversationId: string | null) => void
  /** Opens *New task* on this workspace; absent where no task can be made (a person's own space, no Git). */
  onNewTask?: () => void
  /** A task made here whose first run has not made its branch yet. */
  pendingTask?: { id: string; title: string } | null
}) {
  if (line?.whose.kind === 'conversation') {
    return <Thread conversationId={line.whose.conversationId} listPath={listPath} onActivity={onActivity} />
  }
  if (line?.whose.kind === 'task') {
    return <TaskThread taskId={line.whose.taskId} taskKey={line.whose.taskKey} onActivity={onActivity} onThread={onTaskThread} />
  }
  if (pending) return <Thread conversationId={pending} listPath={listPath} onActivity={onActivity} />
  return <MainConversation workspaceId={workspaceId} canAct={canAct} onStarted={onStarted} onNewTask={git ? onNewTask : undefined} pendingTask={pendingTask ?? null}
    words={git ? 'main has no conversation of its own. A new conversation or a new task here works on a new branch of its own.' : `A new conversation here works in ${workspaceName}'s files.`} />
}

function Thread({ conversationId, listPath, onActivity, agentsById, onSeen }: {
  conversationId: string
  listPath: string
  onActivity: (activity: ThreadActivity) => void
  agentsById?: Record<string, ConversationAgentView>
  onSeen?: (seq: number) => void
}) {
  // Deleting or archiving it leaves the view where it is; the branch's line says what became of it.
  const stay = useCallback(() => undefined, [])
  return (
    <Suspense fallback={loading}>
      <ConversationThread key={conversationId} conversationId={conversationId} listPath={listPath}
        agentsById={agentsById} onSeen={onSeen} onActivity={onActivity} onDeleted={stay} onArchived={stay} />
    </Suspense>
  )
}

function TaskThread({ taskId, taskKey, onActivity, onThread }: {
  taskId: string
  taskKey: string | null
  onActivity: (a: ThreadActivity) => void
  onThread?: (conversationId: string | null) => void
}) {
  const { data, error } = useQuery(getTaskConversation, { taskId })
  const { data: agents } = useQuery(getAgents)
  const readThrough = useRef(0)
  const conversationId = data?.conversation?.id ?? null
  useEffect(() => {
    if (!onThread || !conversationId) return
    onThread(conversationId)
    return () => onThread(null)
  }, [onThread, conversationId])
  const agentsById = useMemo(() => {
    const byId: Record<string, ConversationAgentView> = {}
    for (const a of agents ?? []) byId[a.id] = a
    if (data?.lead) byId[data.lead.id] = data.lead
    return byId
  }, [agents, data?.lead])
  const markRead = useCallback((seq: number) => {
    if (!conversationId || seq <= readThrough.current) return
    readThrough.current = seq
    markConversationRead({ conversationId, throughSeq: seq }).catch(() => { readThrough.current = seq - 1 })
  }, [conversationId])
  const taskPath = taskKey ? `/tasks/${encodeURIComponent(taskKey)}` : '/tasks'
  if (error) return <p role="status" className="px-4 py-6 text-small text-text-muted">{error.message}</p>
  if (!data) return loading
  if (!data.conversation) {
    // Its first message starts the task's thread, which the agent reads at its next run and where its runs then show.
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 px-3 py-3 text-small text-text-secondary" data-testid="task-first-message">
        <p>Messages about {taskKey ? `task ${taskKey}` : 'this task'} go to its conversation, where {data.lead?.name ?? 'its agent'} reads them at its next run.</p>
        {data.canStart ? <TaskFirstMessage taskId={taskId} agentName={data.lead?.name ?? null} /> : <p role="status" className="text-text-muted">{data.refusal}</p>}
        <Link to={taskPath} className="text-accent hover:underline">Open the task</Link>
      </div>
    )
  }
  return <Thread conversationId={data.conversation.id} listPath={taskPath} agentsById={agentsById} onSeen={markRead} onActivity={onActivity} />
}

function MainConversation({ workspaceId, canAct, onStarted, onNewTask, pendingTask, words }: {
  workspaceId: string
  canAct: boolean
  onStarted: (id: string) => void
  onNewTask?: () => void
  pendingTask: { id: string; title: string } | null
  words: string
}) {
  const start = useAction(startWorkspaceConversation)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async () => {
    setBusy(true)
    setError(null)
    try { onStarted((await start({ workspaceId })).conversationId) } catch (e) { setError(e instanceof Error ? e.message : 'The conversation could not be started.') } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3 px-4 py-6 text-small text-text-secondary" data-testid="main-conversation">
      <p>{words}</p>
      <button type="button" className={FILES_BUTTON_PRIMARY} disabled={!canAct || busy} onClick={() => void go()} title={canAct ? undefined : VIEWER_REASON}>
        <MessageSquarePlus size={14} aria-hidden /> New conversation
      </button>
      {onNewTask && (
        <button type="button" className={`${FILES_BUTTON} ml-2`} disabled={!canAct} onClick={onNewTask} title={canAct ? undefined : VIEWER_REASON}>
          <ListPlus size={14} aria-hidden /> New task
        </button>
      )}
      {pendingTask && (
        <p role="status" data-testid="pending-task">The task “{pendingTask.title}” is starting. Its branch shows here when its run begins.</p>
      )}
      {!canAct && <p className="text-micro text-text-muted">{VIEWER_REASON}</p>}
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>
  )
}
