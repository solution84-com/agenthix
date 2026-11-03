import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react'
import {
  useQuery, getTaskConversation, startTaskConversation, markConversationRead, getAgents,
} from 'wasp/client/operations'
import type { ConversationAgentView } from '../../shared/conversations/protocol'
import { actionErrorText, clientIdFor } from '../../conversations/hooks/threadState'
import { MessageBox } from '../../conversations/components/MessageBox'
import { RefusedAction } from '../../shared/components/RefusedAction'

// Loaded when a task's page opens a thread, not with every screen that can show a task.
const ConversationThread = lazy(() => import('../../conversations/components/ConversationThread').then((m) => ({ default: m.ConversationThread })))

/** The thread's own height on the task's page: the page scrolls around it. */
const THREAD_HEIGHT = 'h-[34rem] max-h-[80vh]'

/**
 * The task's conversation on its page (on-screen spec, A task's thread): the message box that creates it with the
 * first message, then the thread itself with the task's agent. Where the person may not talk, or the task has no
 * agent, the reason stands in the box's place. Opening it marks what is on screen as read.
 */
export function TaskThreadSection({ taskId, taskKey }: { taskId: string; taskKey: string }) {
  const { data, error } = useQuery(getTaskConversation, { taskId })
  const { data: agents } = useQuery(getAgents)
  const readThrough = useRef(0)
  const conversationId = data?.conversation?.id ?? null

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

  if (error) return null
  if (!data) return null

  return (
    <section aria-label="Conversation" className="space-y-2" data-testid="task-thread">
      <h2 className="text-small font-semibold text-text-primary">Conversation{data.lead ? ` with ${data.lead.name}` : ''}</h2>
      {data.conversation ? (
        <>
          {data.refusal && <p role="status" className="text-small text-text-muted">{data.refusal}</p>}
          <div className={`flex flex-col overflow-hidden rounded-xl border border-border-subtle ${THREAD_HEIGHT}`}>
            <Suspense fallback={<p className="px-4 py-6 text-small text-text-muted">Loading…</p>}>
              <ConversationThread
                key={data.conversation.id}
                conversationId={data.conversation.id}
                listPath={`/tasks/${encodeURIComponent(taskKey)}`}
                agentsById={agentsById}
                onSeen={markRead}
              />
            </Suspense>
          </div>
        </>
      ) : data.canStart ? (
        <TaskFirstMessage taskId={taskId} agentName={data.lead?.name ?? null} />
      ) : (
        <p role="status" className="text-small text-text-muted">{data.refusal}</p>
      )}
    </section>
  )
}

/**
 * The box before the thread exists: its first message creates it, and the query then brings the thread in its place.
 * Also where a task's branch shows its thread in the workspace view.
 */
export function TaskFirstMessage({ taskId, agentName }: { taskId: string; agentName: string | null }) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attempt = useRef<{ text: string; id: string } | null>(null)

  const send = async (text: string): Promise<boolean> => {
    attempt.current = clientIdFor(attempt.current, text)
    setSending(true)
    setError(null)
    try {
      await startTaskConversation({ taskId, clientMessageId: attempt.current.id, text })
      attempt.current = null
      return true
    } catch (err) {
      setError(actionErrorText(err, 'Could not start the conversation'))
      return false
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <RefusedAction reason={error} onDismiss={() => setError(null)} className="mb-2" />
      <MessageBox
        placeholder={agentName ? `Message ${agentName} about this task…` : 'Write a message about this task…'}
        running={false}
        sending={sending}
        onSend={send}
        onStop={() => undefined}
      />
    </div>
  )
}
