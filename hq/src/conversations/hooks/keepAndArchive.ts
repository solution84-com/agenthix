import { archiveConversation, setConversationKeep } from 'wasp/client/operations'
import { toast } from '@agenthix/ui/attention'
import { actionErrorText } from './threadState'
import { threadLine, type ThreadNudges } from './useThreadNudges'

/**
 * Keep it and Archive from the conversation's menu. A refusal is a line in the thread with Try again. The menu closes
 * on Keep it, so nothing on screen shows it worked: a toast says so, and the view is read again.
 */
export function keepAndArchive({ conversationId, keep, push, clear, refetchView, onArchived }: {
  conversationId: string
  keep: boolean
  push: ThreadNudges['push']
  clear: ThreadNudges['clear']
  refetchView: () => void
  onArchived: () => void
}) {
  const toggleKeep = async (): Promise<void> => {
    try {
      await setConversationKeep({ conversationId, keep: !keep })
      clear('keep')
      toast(!keep ? 'Kept out of archiving' : 'No longer kept')
      refetchView()
    } catch (err) {
      push({ key: 'keep', text: threadLine(!keep ? 'It was not kept' : 'It was not let go', actionErrorText(err)), retry: () => void toggleKeep() })
    }
  }
  const archive = async (): Promise<void> => {
    try {
      await archiveConversation({ conversationId })
      clear('archive')
      onArchived()
    } catch (err) {
      push({ key: 'archive', text: threadLine('The conversation was not archived', actionErrorText(err)), retry: () => void archive() })
    }
  }
  return { toggleKeep, archive }
}
