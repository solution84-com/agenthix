/**
 * The voice socket events (`CONVERSATION_VOICE_SOCKET`) from a browser. Every payload comes from the browser, so
 * each is checked before it reaches anything; a listener's failure is sent back as `error` rather than left to
 * end the process.
 */
import { CONVERSATION_VOICE_SOCKET as V, type VoiceErrorEvent } from '../../shared/conversations/voice'
import { CONVERSATION_VOICE_PAGE_SOCKET as VP } from '@agenthix/core'
import { MESSAGE_MAX_CHARS } from '../../shared/conversations/protocol'
import { endVoiceFrom, heldBy, heldBySpeaker, interruptVoice, inviteVoice, socketGone, startVoice, voiceActivity, VoiceRefused } from './service'
import { continueVoice } from './continue'
import { listening, unheard } from './listening'
import type { ListenPayload } from './listening/listen'
import { humService } from './humService'
import { soundRequestOf, type HumQuestion, type SoundRequest } from './humService/service'
import { HUM_RECENT } from './humService/instructions'
import { demoOn } from '../../demo/demoMode'
import { voiceToneOf } from './toneSteering'

export interface VoiceSocket {
  id: string
  /** `client` is set when an app stated its client protocol; hq's own pages state none (clientProtocol.ts). */
  data?: { user?: { id: string }; client?: unknown }
  emit(event: string, payload: unknown): unknown
  on(event: string, listener: (payload: unknown) => void): unknown
}

interface Log { error(message: string, err: unknown): void }

const COULD_NOT = 'Voice could not do that just now. Try again.'

function idOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && value.length <= 200 ? value : null
}

function field(payload: unknown, name: string): unknown {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[name] : undefined
}

const MOMENTS: ReadonlySet<unknown> = new Set(['quietAfterWords', 'soundsFinished', 'quiet', 'working'])
/** The longest wait a call may say: an hour, far past any bound. */
const MAX_MS = 3_600_000

function ms(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(value, MAX_MS) : null
}

/** A `listen` payload as the browser may send it, or null. */
export function listenPayloadOf(payload: unknown): ListenPayload | null {
  const seq = field(payload, 'seq')
  const moment = field(payload, 'moment')
  const text = field(payload, 'text') ?? ''
  const quietMs = ms(field(payload, 'quietMs') ?? 0)
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || !MOMENTS.has(moment)) return null
  if (typeof text !== 'string' || text.length > MESSAGE_MAX_CHARS || quietMs === null) return null
  const workingMs = ms(field(payload, 'workingMs'))
  return {
    seq, moment: moment as ListenPayload['moment'], text, quietMs,
    ...(workingMs !== null ? { workingMs } : {}), ...(field(payload, 'keptOpen') === true ? { keptOpen: true } : {}),
  }
}

/** The last sounds a `backchannel` payload names: at most three, each short; anything else is left out. */
function recentOf(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const recent = value.filter((w): w is string => typeof w === 'string' && w.trim() !== '' && w.length <= 40).slice(-HUM_RECENT)
  return recent.length ? recent : null
}

/** A `backchannel` payload as the browser may send it, or null. */
export function backchannelPayloadOf(payload: unknown): HumQuestion | null {
  const seq = field(payload, 'seq')
  const text = field(payload, 'text')
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || typeof text !== 'string' || text.length > MESSAGE_MAX_CHARS) return null
  const recent = recentOf(field(payload, 'recent'))
  return text.trim() ? { seq, text, ...(field(payload, 'atPause') === true && { atPause: true as const }), ...(recent && { recent }) } : null
}

/** A `backchannelSpeak` payload: a kind of the hum library and a tone it takes; or null. */
export const speakPayloadOf = (payload: unknown): SoundRequest | null =>
  soundRequestOf(field(payload, 'kind'), field(payload, 'tone'), field(payload, 'warm'))

export function registerConversationVoice(socket: VoiceSocket, log: Log): void {
  // The demo's voice screen plays recorded lines in the browser and sends nothing here: no event is taken, so nothing
  // can take voice or reach a speech service.
  if (demoOn()) return
  function on(event: string, act: (userId: string, conversationId: string, payload: unknown) => Promise<void> | void): void {
    socket.on(event, (payload) => {
      const userId = socket.data?.user?.id
      const conversationId = idOf(field(payload, 'conversationId'))
      if (!userId || !conversationId) return
      void (async () => {
        try {
          await act(userId, conversationId, payload)
        } catch (err) {
          if (!(err instanceof VoiceRefused)) log.error(`${event} failed for ${socket.id}`, err)
          const message = err instanceof VoiceRefused ? err.message : COULD_NOT
          socket.emit(V.error, { conversationId, message } satisfies VoiceErrorEvent)
        }
      })()
    })
  }

  on(V.start, (userId, conversationId) => startVoice(socket.id, userId, conversationId))
  on(V.end, (userId, conversationId, payload) =>
    endVoiceFrom(socket.id, userId, conversationId, field(payload, 'failed') === 'speech-to-text'))
  on(V.interrupt, (userId, conversationId, payload) => {
    const turnId = idOf(field(payload, 'turnId'))
    const heardThrough = field(payload, 'heardThrough')
    if (!turnId || typeof heardThrough !== 'number' || !Number.isFinite(heardThrough)) return
    // Words heard of the next sentence: optional, as a browser before them never sends it.
    const words = field(payload, 'heardWords')
    const heardWords = typeof words === 'number' && Number.isFinite(words) && words > 0 ? words : 0
    return interruptVoice(socket.id, userId, conversationId, turnId, heardThrough, heardWords)
  })
  on(V.activity, (userId, conversationId) => voiceActivity(socket.id, userId, conversationId))
  on(V.invite, (userId, conversationId, payload) => {
    const updateId = idOf(field(payload, 'updateId'))
    if (updateId) return inviteVoice(socket.id, userId, conversationId, updateId)
  })
  on(V.continue, (userId, conversationId, payload) => {
    const turnId = idOf(field(payload, 'turnId'))
    const text = field(payload, 'text')
    if (!turnId || typeof text !== 'string' || text.length > MESSAGE_MAX_CHARS) return
    return continueVoice(socket.id, userId, conversationId, turnId, text, field(payload, 'trailedOff') === true)
  })

  on(V.listen, async (userId, conversationId, payload) => {
    const listen = listenPayloadOf(payload)
    if (!listen) return
    const session = await heldBySpeaker(socket.id, userId, conversationId)
    if (session) await listening.listen(session, listen)
  })
  // About once a second while the person speaks: the holder check only, kept in memory (`listen` checks the rest).
  on(VP.backchannel, async (userId, conversationId, payload) => {
    const question = backchannelPayloadOf(payload)
    const session = question && heldBy(socket.id, userId, conversationId)
    if (session) await humService.ask(session, question)
  })
  // The sound keeper: a kind's sounds in a tone, from the hum library only.
  on(VP.backchannelSpeak, async (userId, conversationId, payload) => {
    const request = speakPayloadOf(payload)
    const session = request && heldBy(socket.id, userId, conversationId)
    if (session) await humService.speak(session, request)
  })
  // Tone: its switch and the voice hint, which every layer reads as it speaks (`toneSteering.ts`).
  on(VP.voiceTone, (userId, conversationId, payload) => {
    const session = heldBy(socket.id, userId, conversationId)
    if (session) session.tone = voiceToneOf(payload)
  })
  on(V.linePlayed, (userId, conversationId, payload) => {
    const lineId = idOf(field(payload, 'lineId'))
    const session = heldBy(socket.id, userId, conversationId)
    if (!lineId || !session) return
    // Skipped: the browser dropped it, never heard.
    if (field(payload, 'skipped') === true) return unheard.skipped(session, lineId)
    listening.played(session, lineId)
  })

  socket.on('disconnect', () => {
    void socketGone(socket.id).catch(err => log.error(`Could not end voice for ${socket.id}`, err))
  })
}
