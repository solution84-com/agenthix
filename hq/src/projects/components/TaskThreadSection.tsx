import { useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Button } from '@agenthix/ui/primitives'
import { useQuery, getTaskConversation, startTaskConversation } from 'wasp/client/operations'
import { actionErrorText, clientIdFor } from '../../conversations/hooks/threadState'
import { MessageBox } from '../../conversations/components/MessageBox'
import { useDock } from '../../dock/DockContext'
import { canvasPlaceOf } from '../../dock/startPlace'
import { retryUnlessDenied } from '../place/retryUnlessDenied'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * *Talk about this task* (the board's f5): puts the task's conversation in the chat panel, which is where every
 * conversation is written; the task's page has no box of its own. The conversation is started the first time,
 * with the task attached, by its first message written in the panel. Where the person may not talk, or the task
 * has no agent, the button is off and its hover says why.
 */
export function TaskThreadSection({ taskId, taskKey, label = 'Talk about this task' }: {
  taskId: string
  taskKey: string
  /** The button's words: an epic's reads *Talk about this epic*. */
  label?: string
}) {
  const talk = useTalkAboutTask(taskId, taskKey)
  if (!talk) return null
  return (
    <Button
      variant="secondary"
      data-testid="talk-about-task"
      onClick={talk.open}
      disabled={!!talk.refusal}
      title={talk.refusal ?? undefined}
      leadingIcon={<MessageSquare size={14} aria-hidden />}
    >
      {label}
    </Button>
  )
}

/**
 * What *Talk about this task* does, for any control that offers it (the header's button, the line under the comment
 * box): opens the task's conversation in the chat panel, or starts it there. Null where there is no chat panel.
 */
export function useTalkAboutTask(taskId: string, taskKey: string): { open: () => void; refusal: string | null } | null {
  const dock = useDock()
  const { data, error } = useQuery(getTaskConversation, taskId ? { taskId } : undefined, { retry: retryUnlessDenied })
  if (!dock || error || !data) return null
  const refused = !data.conversation && !data.canStart
  return {
    refusal: refused ? data.refusal ?? 'You cannot talk about this task.' : null,
    open: () => {
      if (data.conversation) dock.openConversation(data.conversation.id, null)
      else dock.startNew(canvasPlaceOf(`/tasks/${taskKey}`), null, { taskId, taskKey, agentName: data.lead?.name ?? null })
    },
  }
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
      <ShowAttention text={error} title="The comment was not posted" onClose={() => setError(null)} />
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
