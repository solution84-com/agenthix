/**
 * A heavy reply under the light model (adaptive voice listening, spec §What is stored; plan tasks 3.6 and 3.7): its
 * agent message starts with what the person heard while they spoke and waited — the light model's lines and any stored
 * hold phrase, in order — so the heavy model sees them from the next turn on and never in the turn they belong to; and
 * once a reply that completed, not interrupted, is written, the recap is written after it. A reply withdrawn because
 * the person went on leaves the lines for the turn that answers again — or, written already, hands them back
 * (`ListeningState.replyUnheard`), which also aborts or undoes its recap, as a later cut of it does. The lines taken
 * are kept a while, so one the browser skipped can be taken out of the stored message again (unheard.ts).
 */
import type { TurnSpeech } from '../session'
import { joinHeard, type ListeningState } from './state'

/** Called once the reply is written: the recap's turn. `unheard` aborts when the reply turns out not to be heard. */
export type AfterReply = (agentText: string, unheard: AbortSignal) => void

export function withHeardLines(speech: TurnSpeech, turnId: string, state: ListeningState, afterReply: AfterReply): TurnSpeech {
  let completed: string | null = null
  return {
    text: (full, stepEnded) => speech.text(full, stepEnded),
    hold: () => speech.hold(),
    tone: tone => speech.tone?.(tone),
    end(endState, full) {
      const said = speech.end(endState, full)
      if (said.withdrawn) return said
      const lines = state.takeHeard()
      const { text, prefix } = joinHeard(lines.map(l => l.text), said.text)
      if (prefix) {
        state.setPrefix(turnId, prefix)
        speech.heardPrefix?.(prefix)
      }
      state.heardIn(turnId, 'prefix', lines)
      state.awaitingReply = false
      state.turnOver = true
      completed = endState === 'COMPLETED' && !said.interrupted && said.text.trim() ? text : null
      return { ...said, text }
    },
    written(messageId) {
      speech.written(messageId)
      state.wroteMessage(turnId, messageId)
      if (messageId && completed !== null) afterReply(completed, state.recapFor(turnId))
    },
  }
}
