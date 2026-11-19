/**
 * What the speaker plays besides the reply: the standard acknowledgement (`./standardAcknowledgement`), the listening
 * family's clips (`./listenerPhrases`), the light model's lines (`./linePlayer`) and the backchannel's sounds
 * (`../backchannel/sounds`), kept as hq sends them for this voice session. Each is heard like a reply for the echo check, and none is part of a reply. The speaker
 * (`./speaker`) asks whether any plays (a reply not yet playing waits for it) and hears of what each plays (`heard`).
 *
 * The acknowledgement and the clips give way to the person: their speaking stops an invitation at once, and the
 * acknowledgement as soon as they hold the floor. A light model's line never starts while they speak (it is dropped,
 * and the runtime hears why: `dropped`), but once started gives way to nothing. A hum gives way to nothing and
 * interrupts nothing: it starts only while nothing else of the agent's plays, and while it plays a line,
 * a hold and the reply wait for it to end.
 */
import type { VoiceBackchannelSoundEvent, VoiceLineEvent } from '@agenthix/core'
import type { VoicePhraseEvent } from '../../../shared/conversations/protocol'
import type { FloorState, VoiceEventOf } from '../events'
import { createSoundShelf } from '../backchannel/sounds'
import { isHumKind, isHumTone, soundKey } from '../backchannel/kinds'
import { isKindWord } from '../backchannel/library'
import { listeningTierOf } from '../orchestration/listeningTiers'
import type { Playback } from '../playback'
import type { VoiceRuntimeHandle } from '../runtime/types'
import type { VoiceSettings } from '../settings'
import { bufferOf, createLinePlayer } from './linePlayer'
import { createListenerPhrases } from './listenerPhrases'
import { createStandardAcknowledgement, type Heard } from './standardAcknowledgement'

export type SpeakerSoundsDeps = {
  createPlayback: () => Playback
  random?: () => number
  runtime: () => VoiceRuntimeHandle | null
  /** A sound is heard (`playing`), on each tick, and once when it ends. */
  heard: (runtime: VoiceRuntimeHandle, heard: Heard & { lineId?: string; backchannel?: true }) => void
  /** hq hears of a line played to its end, or `skipped`: dropped, never heard. */
  linePlayed: (lineId: string, skipped?: boolean) => void
  /** A line the speaker dropped as it was due, and why: for the runtime's log. */
  dropped?: (lineId: string, why: string) => void
  /** The reply is playing. */
  replyPlaying: () => boolean
  /** The floor is free and voice waits for a reply: when the acknowledgement may start. */
  awaitingReply: () => boolean
  floor: () => FloorState
}

export function createSpeakerSounds(deps: SpeakerSoundsDeps) {
  const acknowledgement = createStandardAcknowledgement({ createPlayback: deps.createPlayback, random: deps.random })
  const listener = createListenerPhrases({ createPlayback: deps.createPlayback, random: deps.random })
  const hums = createSoundShelf({ createPlayback: deps.createPlayback })
  const lines = createLinePlayer({
    createPlayback: deps.createPlayback,
    played: lineId => deps.linePlayed(lineId),
    skipped: (lineId, why) => { deps.linePlayed(lineId, true); if (why) deps.dropped?.(lineId, why) },
    quietGainDb: () => deps.runtime()?.settings().listener.quietGainDb ?? -6,
    mayStart: () => (deps.replyPlaying() ? 'a reply was playing' : deps.floor() === 'person-speaking' ? 'you were speaking' : null),
    waits: () => hums.busy(),
  })

  const ended = (text: string | null) => {
    const runtime = deps.runtime()
    if (text !== null && runtime) deps.heard(runtime, { text, playing: false, audio: new Int16Array(0) })
  }

  return {
    busy: () => acknowledgement.busy() || listener.busy() || lines.busy() || hums.busy(),
    /** On each tick: the acknowledgement starts when it is due and nothing else is heard; each sound playing is followed. */
    tick() {
      const runtime = deps.runtime()
      if (!runtime) return
      const may = deps.awaitingReply() && !deps.replyPlaying() && !listener.busy() && !lines.busy()
      const ack = acknowledgement.tick(runtime.now(), may)
      if (ack) deps.heard(runtime, ack)
      const clip = listener.tick()
      if (clip) deps.heard(runtime, clip)
      const hum = hums.tick()
      if (hum) deps.heard(runtime, { ...hum, backchannel: true })
      const line = lines.tick()
      if (line) deps.heard(runtime, line)
    },
    /** The listening family asks for a sound: never over the person, a reply, or another sound. */
    requested(e: VoiceEventOf<'orchestration.phrase'>, runtime: VoiceRuntimeHandle) {
      const settings = runtime.settings().listening
      const why = deps.floor() === 'person-speaking' ? 'the person was speaking' : deps.replyPlaying() ? 'a reply was playing'
        : acknowledgement.busy() ? 'the acknowledgement was playing' : lines.busy() ? 'a line was playing' : null
      if (why === null && listener.play(e.tiers, settings) === null) {
        const { stored, fits } = listener.available(e.tiers, settings)
        runtime.publish({ kind: 'phrase.skipped', why: listener.busy() ? 'a clip was already playing' : `no clip to play (${stored} stored, ${fits} fit)`, t: runtime.now() })
      } else if (why !== null) runtime.publish({ kind: 'phrase.skipped', why, t: runtime.now() })
    },
    /** The sound keeper starts a sound: it plays only while nothing else of the agent's does. */
    hum(runtime: VoiceRuntimeHandle, e: VoiceEventOf<'backchannel.sound'>) {
      const blocked = deps.replyPlaying() ? 'a reply was playing' : lines.busy() ? 'a line was playing'
        : acknowledgement.busy() || listener.busy() ? 'a stored phrase was playing' : null
      const why = blocked ?? hums.play(runtime.settings().backchannel.gainDb, e.key, e.words)
      runtime.publish({
        kind: 'backchannel.played',
        ...(why === null
          ? { text: e.words, hum: e.hum, tone: e.tone, made: e.made, pausedMs: e.pausedMs }
          : { text: null, why }),
        t: runtime.now(),
      })
    },
    /** A sound of the hum library hq sent: kept for this voice session, and the keeper told it is here, or could not be made. */
    sound(e: VoiceBackchannelSoundEvent, runtime: VoiceRuntimeHandle) {
      if (typeof e.words !== 'string' || !isHumTone(e.tone) || !isHumKind(e.kind) || !isKindWord(e.kind, e.words)) return
      const key = soundKey(e.words, e.tone)
      const ok = !e.failed && !!e.audio && e.audio.byteLength > 0
      if (ok) hums.add(key, bufferOf(e.audio!))
      runtime.publish({
        kind: 'hum.sound', key, words: e.words, tone: e.tone, hum: e.kind, ok, ...(ok && { made: e.made === 'new' ? 'new' as const : 'kept' as const }), t: runtime.now(),
      })
    },
    /** The person speaks: an invitation stops at once; a hum or word is left to finish. */
    personSpeaks() { ended(listener.cancel(true)) },
    /** The person holds the floor: the acknowledgement stops. */
    personHolds() { ended(acknowledgement.cancel()) },
    arm(at: number, settings: VoiceSettings['standardAcknowledgement'], trailedOff?: boolean) { acknowledgement.arm(at, settings, trailedOff) },
    disarm() { acknowledgement.disarm() },
    /** Speech failed: the acknowledgement and the clips stop. A line plays on: it is already whole. */
    failed() {
      ended(acknowledgement.cancel())
      ended(listener.cancel())
    },
    /** A stored phrase in the agent's voice, sent by hq as voice starts. */
    phrase(e: VoicePhraseEvent) {
      const audio = bufferOf(e.audio)
      if (e.use === 'active-listening' || e.use === 'encouragement') listener.add({ text: e.text, audio, tier: listeningTierOf(e.use, e.tier) })
      else acknowledgement.add({ text: e.text, audio, tier: e.tier })
    },
    line(e: VoiceLineEvent) { lines.add(e) },
    allowLine(lineId: string, quiet: boolean) { lines.allow(lineId, quiet) },
    dropLine(lineId: string) { lines.drop(lineId) },
    reset() {
      acknowledgement.cancel()
      acknowledgement.clear()
      listener.clear()
      lines.clear()
      hums.clear()
    },
  }
}

export type SpeakerSounds = ReturnType<typeof createSpeakerSounds>
