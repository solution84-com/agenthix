/**
 * Adaptive voice listening in hq (spec §How it is built), wired: the listening call on the light model, its lines on
 * their own speech path, a turn it closes alone recorded as a real turn, a hand over admitted as a spoken message, and
 * its stored hold phrases and closing lines made ahead; a line the browser skipped taken out of what is stored as heard (`unheard.ts`).
 * The coordinator's hooks are `turnHooks.ts`. The pure parts are `decide.ts`, `state.ts` and the listener module;
 * `listen.ts` is the call's flow.
 */
import { randomUUID } from 'node:crypto'
import type { VoiceListenedEvent } from '@agenthix/core'
import { CONVERSATION_VOICE_SOCKET as V } from '@agenthix/core'
import { admitMessage } from '../../coordinator/admission'
import { conversationEvents } from '../../coordinator/events'
import { Logger } from '../../../server/utils/logger'
import { LISTENER_SETTINGS } from '../listener'
import { voiceSession } from '../registry'
import { toSockets, type AgentVoice } from '../speech'
import { warmHoldPhrases } from '../phrases'
import { createListening, type ListeningSession } from './listen'
import { lineDeps, speakLine, speakStored } from './lines'
import { recordLightTurn } from './lightTurn'
import { listenerAccess, listenerEnabled, listeningContext, voiceListenerFeatureOn } from './reads'
import { listenerModel as model } from './model'
import { listeningIfAny, listeningOf } from './state'
import { createUnheard } from './unheard'
import { rewriteAgentText } from './rewriteHeard'
import { hintWords, LINE_STEERING, spokenTone, steeringOf, TONE_OFF } from '../toneSteering'

export { VOICE_LISTENER_FLAG, voiceListenerFeatureOn } from './reads'

const logger = new Logger('Listening')

/** The agent's voice for each voice session, as voice started: the lines are made in it. */
const voices = new WeakMap<object, AgentVoice>()

function later(ms: number, fn: () => void): () => void {
  const timer = setTimeout(fn, ms)
  timer.unref?.()
  return () => clearTimeout(timer)
}

function toHolder(conversationId: string, event: string, payload: unknown): void {
  const session = voiceSession(conversationId)
  if (session) toSockets(session.socketIds, event, payload)
}

function linesOf(session: ListeningSession) {
  return lineDeps(session.conversationId, (event, payload) => toHolder(session.conversationId, event, payload), (lineId, err, partly) => {
    // A line cut short by a failure was heard as far as it went: it stays.
    if (!partly) listeningOf(session).drop(lineId)
    logger.warn(`A line in ${session.conversationId} could not be ${partly ? 'finished' : 'made'}: ${err instanceof Error ? err.message : String(err)}`)
  })
}

export const listening = createListening({
  settings: LISTENER_SETTINGS,
  enabled: listenerEnabled,
  access: listenerAccess,
  model,
  async context(session) {
    const ctx = await listeningContext(session, LISTENER_SETTINGS.recentExchanges)
    const hint = hintWords(voiceSession(session.conversationId)?.tone ?? TONE_OFF)
    return hint ? { ...ctx, voiceHint: hint } : ctx
  },
  async admit(session, text) {
    await admitMessage({ conversationId: session.conversationId, text, clientMessageId: randomUUID(), spoken: true }, session.holderId)
  },
  closeTurn: (session, turn) => recordLightTurn({ conversationId: session.conversationId, holderId: session.holderId, ...turn }, conversationEvents),
  speak(session, text, tone) {
    const voice = voices.get(session)
    if (!voice) return randomUUID()
    // In the tone the light model gave the line, with some of it; calm with Tone off.
    const picked = spokenTone(voiceSession(session.conversationId)?.tone ?? TONE_OFF, tone ?? null)
    return speakLine(session.conversationId, voice, text, linesOf(session), steeringOf(LINE_STEERING, picked))
  },
  async speakStored(session, avoid, pool) {
    const voice = voices.get(session)
    return voice ? speakStored(session.conversationId, voice, avoid, linesOf(session), pool) : null
  },
  send: (session, event: VoiceListenedEvent) => toHolder(session.conversationId, V.listened, event),
  now: () => Date.now(),
  later,
  log: line => logger.info(line),
})

/** A line the browser skipped, taken out of what is stored as heard. */
export const unheard = createUnheard({
  async rewrite(session, target, edit) {
    const message = await rewriteAgentText(session.conversationId, target, edit)
    if (message) conversationEvents.messageUpdated(session.conversationId, message)
    return message !== null
  },
  later,
  log: line => logger.info(line),
})

/** Voice started: its lines are made in this voice, and with the flag on, the stored hold phrases are made ahead. */
export function listeningStarted(session: object, voice: AgentVoice, stillWanted: () => boolean): void {
  voices.set(session, voice)
  void voiceListenerFeatureOn()
    .then(on => (on ? warmHoldPhrases(voice, stillWanted) : undefined))
    .catch(err => logger.warn(`The stored hold phrases were not made: ${err instanceof Error ? err.message : String(err)}`))
}

/** The voice this session's lines are made in; null before voice started or after it ended. */
export const listeningVoice = (session: object): AgentVoice | null => voices.get(session) ?? null

/** Voice ended: a call in flight stops. */
export function listeningEnded(session: object): void {
  listeningIfAny(session)?.close()
}
