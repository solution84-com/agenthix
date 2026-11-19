/**
 * `set_listening_style` wired (coordinator/listeningStyle.ts): offered with the flag `voiceListener`, and sent to the
 * holder's page as `listened` with the style, only for the person who holds voice in the conversation.
 */
import { createListeningStyleTool } from '../../coordinator/listeningStyle'
import { voiceSession } from '../registry'
import { listening } from '.'
import { voiceListenerFeatureOn } from './reads'

export const listeningStyleTool = createListeningStyleTool({
  featureOn: voiceListenerFeatureOn,
  send(conversationId, userId, style) {
    const session = voiceSession(conversationId)
    if (!session || session.holderId !== userId) return false
    listening.style(session, style)
    return true
  },
})
