import { useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { useQuery, getTaskConversation, startTaskConversation } from 'wasp/client/operations'
import { actionErrorText, clientIdFor } from '../../conversations/hooks/threadState'
import { MessageBox } from '../../conversations/components/MessageBox'
import { RefusedAction } from '../../shared/components/RefusedAction'
import { useDock } from '../../dock/DockContext'
import { canvasPlaceOf } from '../../dock/startPlace'

/**
 * *Talk about this task* (the board's f5): puts the task's conversation in the chat panel, which is where every
 * conversation is written; the task's page has no box of its own. The conversation is started the first time,
 * with the task attached, by its first message written in the panel. Where the person may not talk, or the task
 * has no agent, the button is off and its hover says why.
 */
export function TaskThreadSection({ taskId, taskKey }: { taskId: string; taskKey: string }) {
  const dock = useDock()
  const { data, error } = useQuery(getTaskConversation, { taskId })
  if (!dock || error || !data) return null
  const refused = !data.conversation && !data.canStart

  const talk = () => {
    if (data.conversation) dock.openConversation(data.conversation.id, null)
    else dock.startNew(canvasPlaceOf(`/tasks/${taskKey}`), null, { taskId, taskKey, agentName: data.lead?.name ?? null })
  }
  return (
    <button
      type="button"
      data-testid="talk-about-task"
      onClick={talk}
      disabled={refused}
      title={refused ? data.refusal ?? undefined : undefined}
      className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 py-1 text-small font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
    >
      <MessageSquare size={14} aria-hidden />
      Talk about this task
    </button>
  )
}

/**
 * The box before the thread exists: its first message creates it, and `onStarted` is told which conversation it is.
 * Also where a task's branch shows its thread in the workspace view, which relies on its query to bring the thread.
 */
export function TaskFirstMessage({ taskId, agentName, onStarted }: { taskId: string; agentName: string | null; onStarted?: (conversationId: string) => void }) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attempt = useRef<{ text: string; id: string } | null>(null)

  const send = async (text: string): Promise<boolean> => {
    attempt.current = clientIdFor(attempt.current, text)
    setSending(true)
    setError(null)
    try {
      const result = await startTaskConversation({ taskId, clientMessageId: attempt.current.id, text })
      attempt.current = null
      onStarted?.(result.conversationId)
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
