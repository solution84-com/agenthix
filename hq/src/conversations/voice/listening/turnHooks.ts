/**
 * The coordinator's voice hooks (registry.ts `turnVoice`) under adaptive voice listening: a reply to the holder's
 * message, once the light model listens in the session, starts its agent message with what they heard (heard.ts) and
 * writes the recap once it is written (recapCall.ts). Every other turn is as `turnVoice` makes it.
 */
import { resolveTalking } from '../../access/talkingModel'
import type { ClaimedTurn } from '../../coordinator/claim'
import { Logger } from '../../../server/utils/logger'
import { turnVoice, voiceSession } from '../registry'
import type { TurnSpeech } from '../session'
import { withHeardLines } from './heard'
import { listenerModel } from './model'
import { writeRecap } from './recapCall'
import { listeningIfAny } from './state'

const logger = new Logger('Listening')

export const listeningTurnVoice: typeof turnVoice = {
  ...turnVoice,
  begin(claimed: ClaimedTurn): TurnSpeech | null {
    const speech = turnVoice.begin(claimed)
    const session = voiceSession(claimed.conversation.id)
    const state = session ? listeningIfAny(session) : undefined
    if (!speech || !state?.active || claimed.trigger !== 'MESSAGE') return speech
    return withHeardLines(speech, claimed.turnId, state, (agentText, unheard) => {
      void writeRecap(
        { conversation: claimed.conversation, actingUserId: claimed.actingUserId, inputIds: claimed.inputIds, agentText },
        { model: listenerModel, resolveAccess: resolveTalking, log: line => logger.info(line) },
        unheard,
      ).catch(err => {
        if (unheard.aborted) return logger.info(`The recap of ${claimed.conversation.id} stopped: its reply was not heard`)
        logger.warn(`The recap of ${claimed.conversation.id} was not written: ${err instanceof Error ? err.message : String(err)}`)
      })
    })
  },
}
