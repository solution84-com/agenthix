import { useCallback, useState } from 'react'
import { getTaskConversation } from 'wasp/client/operations'
import { useDock } from '../../dock/DockContext'
import type { PlaceRef } from '../../dock/startPlace'
import type { BranchLineView } from '../../branches/views'
import { agentOf } from '../words'

/**
 * Opens a branch's own chat in the app's chat panel: the conversation it came from, or a task's conversation, started
 * in the panel when the task has none yet. Nothing else in the view opens or moves the chat.
 */
export function useBranchChat(place: PlaceRef) {
  const dock = useDock()
  const [error, setError] = useState<string | null>(null)
  const open = useCallback(async (line: BranchLineView) => {
    if (!dock) return
    setError(null)
    if (line.whose.kind === 'conversation') { dock.openConversation(line.whose.conversationId, null); return }
    const { taskId, taskKey } = line.whose
    try {
      const found = await getTaskConversation({ taskId })
      if (found.conversation) dock.openConversation(found.conversation.id, null)
      else dock.startNew(place, null, { taskId, taskKey: taskKey ?? '', agentName: agentOf(line) })
    } catch (e) {
      setError(e instanceof Error ? e.message : "The task's chat could not be opened.")
    }
  }, [dock, place])
  return { open, error, dismissError: () => setError(null) }
}
