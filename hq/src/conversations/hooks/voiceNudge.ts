import type { VoiceCallValue } from '../../shared/providers/VoiceCallProvider'
import type { ConversationAgentView } from '../../shared/conversations/protocol'
import type { ThreadNudge } from './useThreadNudges'

/**
 * Why voice ended, or what part of it failed, as a line after the thread's last message (decision 3: never a dialog,
 * since in a call the person may not be looking). Where voice has stopped, the line offers Start voice; in a call it
 * can be put away. It goes when voice starts again.
 */
export function voiceNudgeOf(
  conversationId: string,
  call: Pick<VoiceCallValue, 'voice' | 'start' | 'clearNotice'>,
  agent: ConversationAgentView | null,
): ThreadNudge | null {
  const { voice } = call
  if (!voice.notice || voice.noticeFor !== conversationId) return null
  const inCall = voice.conversationId === conversationId && voice.phase !== 'off'
  return inCall
    ? { key: 'voice', text: voice.notice, actionLabel: 'Dismiss', retry: call.clearNotice }
    : {
        key: 'voice', text: voice.notice, actionLabel: 'Start voice',
        retry: () => call.start(conversationId, agent ? { id: agent.id, handle: agent.handle, name: agent.name, avatarUrl: agent.avatarUrl } : null),
      }
}
