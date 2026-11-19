/**
 * `set_listening_style` as hq offers it (adaptive voice listening, spec §The heavy model → *The listening style as an
 * action*): its definition is the lead's (lead/listeningStyle.ts); this binds it to the flag `voiceListener` and to the
 * voice session. Offered on every turn that is offered tools while the flag is on, so the tools a provider caches are
 * the same for a typed turn and a spoken one; it changes something only while the person the turn acts for holds
 * voice in the conversation, and is refused otherwise.
 */
import type { VoiceListenStyle } from '@agenthix/core'
import type { ConversationTool } from '../contract'
import {
  NOT_LISTENING, SET_LISTENING_STYLE, SET_LISTENING_STYLE_DESCRIPTION, listeningStyleInput, styleOf, styleSet,
} from '../lead/listeningStyle'

export interface ListeningStyleDeps {
  featureOn(): Promise<boolean>
  /** Sends the style to the holder's page; false when `userId` does not hold voice in the conversation. */
  send(conversationId: string, userId: string, style: VoiceListenStyle): boolean
}

export function createListeningStyleTool(deps: ListeningStyleDeps): ConversationTool {
  return {
    name: SET_LISTENING_STYLE,
    area: 'conversation',
    input: listeningStyleInput,
    describe: async () => SET_LISTENING_STYLE_DESCRIPTION,
    offered: async capability => capability.trigger !== 'REPORT' && (await deps.featureOn()),
    async run(capability, input) {
      const style = styleOf(input)
      if (!style) return { status: 'refused', reason: 'Name one style: hums_off, hums_fewer, patient or normal.' }
      const person = capability.actingUserId
      if (!person || !deps.send(capability.conversationId, person, style)) return NOT_LISTENING
      return styleSet(capability.turnId, style)
    },
  }
}
