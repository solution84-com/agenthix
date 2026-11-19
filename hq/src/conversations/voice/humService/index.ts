/**
 * The listening read in hq, wired (adaptive voice listening, spec §The listening read): on with the flag
 * `voiceListener` and the holder's Adaptive voice, as the light model is; its model through the resolver's purpose
 * `backchannel`, costed under it; its answers to the holder's sockets. The access is kept a short while per voice
 * session, since the page asks about once a second. The hum library's sounds are kept per agent voice on hq's disk
 * (`./store`), and one not made yet is spoken in the voice the session's lines are made in, and costed as they are.
 * Tone and the voice hint are the voice session's, as its page said.
 */
import { CONVERSATION_VOICE_PAGE_SOCKET as VP } from '@agenthix/core'
import type { ResolvedAccess } from '../../contract'
import { resolve } from '../../../routing/resolver'
import { hqCallAccess } from '../../../routing/reaching'
import { placeOfConversation } from '../../../routing/place'
import { costingOf } from '../../../billing/costing'
import { prisma } from 'wasp/server'
import { leadAgentId } from '../../taskThread/lead'
import { voiceSession } from '../registry'
import { toSockets } from '../speech'
import { listenerEnabled } from '../listening/reads'
import { listenerModel } from '../listening/model'
import { listeningVoice } from '../listening'
import { inworldTtsAdapter } from '../../../voice/inworldAdapter'
import { recordTts } from '../../../billing/sources/voice'
import { reported } from '../reportedSpeech'
import { getVoiceCacheDir } from '../../../server/hqStoragePaths'
import { createSoundStore } from './store'
import { createHumService, type HumSession } from './service'
import { HUM_CALL_LIMIT_MS } from './instructions'
import { hintWords, TONE_OFF } from '../toneSteering'

/** How long a voice session's access is kept before it is resolved again. */
const KEPT_MS = 30_000

const kept = new WeakMap<HumSession, { access: ResolvedAccess | null; at: number }>()

const store = createSoundStore(getVoiceCacheDir)

/** The hum service's access for this conversation, costed under `backchannel`; null when no fast model is reached. */
async function humAccess(session: HumSession): Promise<ResolvedAccess | null> {
  const ref = await prisma.conversation.findUnique({
    where: { id: session.conversationId },
    select: { id: true, home: true, projectId: true, taskId: true, openedById: true, agentId: true },
  })
  if (!ref) return null
  const agentId = await leadAgentId(ref)
  const req = {
    purpose: 'backchannel' as const, place: await placeOfConversation(ref), userId: session.holderId, conversationId: ref.id,
    ...(agentId ? { agentId } : {}),
  }
  const answer = await resolve(req)
  if (!answer.ok) return null
  const access = await hqCallAccess(answer.resolution)
  return access ? { ...access, costing: costingOf(answer.resolution, req) } : null
}

export const humService = createHumService({
  enabled: listenerEnabled,
  async access(session) {
    const now = Date.now()
    const k = kept.get(session)
    if (k && now - k.at < KEPT_MS) return k.access
    const access = await humAccess(session)
    kept.set(session, { access, at: now })
    return access
  },
  model: listenerModel,
  send(session, event) {
    const voice = voiceSession(session.conversationId)
    if (voice) toSockets(voice.socketIds, VP.backchannelKind, event)
  },
  async made(session, sound) {
    const voice = listeningVoice(session)
    return voice ? store.made(voice, sound) : false
  },
  async speak(session, sound) {
    const voice = listeningVoice(session)
    if (!voice) return null
    const costed = voice.costed
    return store.sound(voice, sound, async function* (said) {
      for await (const { audio } of reported(voice.providerId, inworldTtsAdapter.synthesizeStream(said, voice),
        costed ? () => recordTts(costed, said.length, { conversationId: session.conversationId }) : undefined)) yield audio
    })
  },
  sendSound(session, event) {
    const voice = voiceSession(session.conversationId)
    if (voice) toSockets(voice.socketIds, VP.backchannelSound, event)
  },
  tone(session) {
    const tone = voiceSession(session.conversationId)?.tone ?? TONE_OFF
    return { on: tone.on, hint: hintWords(tone) }
  },
  now: () => Date.now(),
  timeoutMs: HUM_CALL_LIMIT_MS,
})
