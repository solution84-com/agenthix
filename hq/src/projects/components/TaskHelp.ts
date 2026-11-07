import { useQuery, getTaskConversation, startTaskConversation } from 'wasp/client/operations'
import { clientIdFor, actionErrorText } from '../../conversations/hooks/threadState'
import { useDock } from '../../dock/DockContext'
import type { Attention } from '../../shared/components/AttentionDialog'

/** The message Ask <agent> to help sends: what to do, and the draft so far. */
export function helpMessage(taskKey: string, draft: string): string {
  const text = draft.trim()
  return text
    ? `Please help me write the description of ${taskKey}. Here is my draft so far:\n\n${text}`
    : `Please help me write the description of ${taskKey}.`
}

/**
 * Ask <agent> to help (T0): the draft goes to the task's conversation (started with it when there is none yet), which
 * opens in the chat panel; the agent can then update the description there. Absent where there is no chat panel.
 */
export function useTaskHelp(taskId: string, taskKey: string, show: (a: Attention) => void) {
  const dock = useDock()
  const { data } = useQuery(getTaskConversation, taskId ? { taskId } : undefined, { enabled: !!taskId })
  if (!dock || !data) return undefined
  const refusal = data.conversation ? data.refusal : (data.canStart ? null : data.refusal ?? 'You can’t talk about this task.')
  let attempt: { text: string; id: string } | null = null
  const ask = async (draft: string): Promise<void> => {
    const text = helpMessage(taskKey, draft)
    attempt = clientIdFor(attempt, text)
    try {
      const { conversationId } = await startTaskConversation({ taskId, clientMessageId: attempt.id, text })
      dock.openConversation(conversationId, null)
    } catch (err) {
      show({ title: 'The message wasn’t sent', text: `${actionErrorText(err, 'Could not send it')} Nothing was changed.`, retry: () => void ask(draft) })
      throw err
    }
  }
  return { label: `Ask ${data.lead?.name ?? 'the agent'} to help`, refusal, ask, hasConversation: !!data.conversation }
}
