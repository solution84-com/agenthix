/**
 * The speaker: the reply's audio played sentence by sentence (`../playback`), and its text held back so it shows
 * only as far as it has been heard. On each of the runtime's ticks it reads where the ear is and publishes it
 * (`playback.at`), with what went to the speaker at 16 kHz (`playback.frame`) for the echo check. It ducks, resumes
 * and stops the reply when Orchestration says so, in the page, and on a stop tells hq what was heard.
 *
 * Only the current reply is heard: a reply that was stopped, or that the person's next words joined, is dropped
 * wherever its audio still is. A new reply that arrives while the person holds the floor (they spoke again before
 * it was heard) waits: it plays if the floor comes back to the agent, and is dropped if the person's words join it.
 *
 * `playback.at` with `playing: false` is published once, when playback ends: `ended` when the reply was heard to
 * its end, not when it was stopped.
 *
 * A reply's text is usually written before its first sentence is spoken: its turn ending is not a reason to show it.
 * It stays held until it is heard, hq says nothing of it was spoken, or no speech has come for `FIRST_SENTENCE_MS`;
 * showing it whole at its end, before the voice, made it flash and vanish when the voice began.
 *
 * While a reply is awaited, with the person's Adaptive voice on, the standard acknowledgement may play once, at the
 * ceiling; the listening family's clips play when Orchestration asks; and under the light model its lines play as their
 * answers allow (`listen.play`), never cut. Each is heard like a reply for the echo check, none is a reply, and a reply
 * that arrives meanwhile waits for it to end (`./speakerSounds`). With the flag `voiceListener` on there is no standard
 * acknowledgement. A turn hq held (`turnHeld`) has no reply: nothing of it is played, the floor is free again, and the
 * person's next words join its message.
 */
import type { VoiceBackchannelSoundEvent, VoiceHeardPrefixEvent, VoiceLineEvent } from '@agenthix/core'
import type {
  ConversationDeltaEvent, ConversationTurnEvent, VoiceAudioEvent, VoicePhraseEvent, VoiceSentenceEvent,
  VoiceTurnHeldEvent, VoiceTurnSpokenEvent,
} from '../../../shared/conversations/protocol'
import type { FloorState } from '../events'
import type { Playback } from '../playback'
import { wordsHeard } from '../reveal'
import { setHeardCut } from '../heardCut'
import type { Adapter, VoiceRuntimeHandle } from '../runtime/types'
import type { VoiceSnapshot } from '../voiceSnapshot'
import type { Heard } from './standardAcknowledgement'
import type { HqVoice } from './hqSocket'
import { bufferOf } from './linePlayer'
import { createSpeakerSounds } from './speakerSounds'
import { createHeading } from './heading'

/** How long a reply waits for its first sentence of speech before its text is shown anyway. */
const FIRST_SENTENCE_MS = 12_000
/** `playback.frame` is published in frames the size of the microphone's: 32 ms at 16 kHz. */
const FRAME = 512
/** The person holds the floor: a reply not yet playing waits. */
const PERSONS: ReadonlySet<FloorState> = new Set(['person-speaking', 'person-pausing'])

export type SpeakerDeps = {
  snapshot: () => VoiceSnapshot
  set: (patch: Partial<VoiceSnapshot>) => void
  createPlayback: () => Playback
  hq: HqVoice
  /** The runtime while voice is on. */
  runtime: () => VoiceRuntimeHandle | null
  /** Draws which stored phrase; `Math.random` when not given. */
  random?: () => number
}

type Waiting =
  | { kind: 'sentence'; e: VoiceSentenceEvent }
  | { kind: 'audio'; e: VoiceAudioEvent }
  | { kind: 'turnSpoken'; e: VoiceTurnSpokenEvent }

export function createSpeaker(deps: SpeakerDeps) {
  const { snapshot, set } = deps
  let playback: Playback | null = null
  let spokenTurnId: string | null = null
  let turnFinished = false
  /** The playhead is followed from a reply's first sentence until it stops. */
  let following = false
  const firstSentence = new Map<string, ReturnType<typeof setTimeout>>()
  const seenTurns = new Set<string>()
  /** Replies that began to play. */
  const playedTurns = new Set<string>()
  /** Replies never to be heard: stopped, or joined by the person's next words. */
  const dropped = new Set<string>()
  /** A reply that came while the person held the floor, in the order it came. */
  let waiting: Waiting[] = []
  let floor: FloorState = 'open'
  /** The person has said words not yet sent: a reply not yet playing waits for them, since they may join its message. */
  let unsent = false
  /** Audio already sent to the speaker but not yet published as frames. */
  let frameCarry = new Int16Array(0)

  const now = () => deps.runtime()?.now() ?? Date.now()
  const publish = deps.runtime
  const sounds = createSpeakerSounds({
    createPlayback: deps.createPlayback, random: deps.random, runtime: deps.runtime,
    heard: (runtime, heard) => heardPhrase(runtime, heard),
    linePlayed: (lineId, skipped) => { const id = snapshot().conversationId; if (id) deps.hq.linePlayed(id, lineId, skipped) },
    dropped: (lineId, why) => { const rt = deps.runtime(); rt?.publish({ kind: 'listen.drop', lineId, why, t: rt.now() }) },
    replyPlaying: () => playback !== null,
    awaitingReply: () => !PERSONS.has(floor) && snapshot().phase === 'thinking',
    floor: () => floor,
  })
  /** Playback has ended for this reply; `ended` when it was heard to its end. */
  const ended = (replyId: string | null, index: number, heardToEnd: boolean) => {
    publish()?.publish({ kind: 'playback.at', replyId: replyId ?? '', index, elapsedMs: 0, ended: heardToEnd, playing: false, t: now() })
  }

  const clearFirstSentence = (turnId?: string) => {
    for (const [id, t] of firstSentence) if (!turnId || id === turnId) { clearTimeout(t); firstSentence.delete(id) }
  }
  /** The lines heard that start a reply's message, by turn, as hq said them: for a reply not held yet when they arrive. */
  const heardPrefixes = new Map<string, string>()
  const heading = createHeading(snapshot, set)
  /**
   * Voice is done with the reply, and its bubble no longer heads the lines heard. hq put them in its message when it said
   * so (`heardPrefix`), or when the person cut the reply (`taken`): a reply heard in part keeps them. Only a reply
   * withdrawn (held, or joined by the person's next words) leaves them to the next (`taken` false).
   */
  const forget = (turnId: string, taken = heardPrefixes.has(turnId)) => {
    heading.done(turnId, taken)
    heardPrefixes.delete(turnId)
  }
  const release = (turnId: string, taken?: boolean) => {
    clearFirstSentence(turnId)
    forget(turnId, taken)
    if (snapshot().reveal?.turnId === turnId) set({ reveal: null })
  }
  /** The reply has speech waiting to play (the person holds the floor, or a line plays): it will be heard. */
  const speechWaits = (turnId: string) => waiting.some(w => w.kind === 'sentence' && w.e.turnId === turnId)
  /** Nothing of the reply will be heard: its text shows whole, and the floor is free. */
  const nothingSpoken = (turnId: string) => {
    sounds.disarm()
    release(turnId)
    if (playedTurns.has(turnId)) return
    publish()?.publish({ kind: 'reply.spoken', replyId: turnId, sentences: 0, t: now() })
    if (snapshot().phase === 'thinking') set({ phase: 'listening' })
  }
  const holdReply = (turnId: string) => {
    seenTurns.add(turnId)
    const heardPrefix = heardPrefixes.get(turnId)
    set({ reveal: { turnId, head: null, sentences: [], ...(heardPrefix && { heardPrefix }) } })
    firstSentence.set(turnId, setTimeout(() => {
      const reveal = snapshot().reveal
      if (reveal?.turnId === turnId && reveal.sentences.length === 0 && !speechWaits(turnId)) nothingSpoken(turnId)
    }, FIRST_SENTENCE_MS))
  }

  /** The reply has been heard to its end: its text is whole, and the person is listened to again. */
  const finishSpeaking = () => {
    following = false
    const turnId = snapshot().reveal?.turnId
    const head = playback?.position()
    playback?.stop()
    playback = null
    turnFinished = false
    frameCarry = new Int16Array(0)
    const replyId = spokenTurnId
    spokenTurnId = null
    if (turnId) release(turnId)
    if (snapshot().phase !== 'off') set({ phase: 'listening' })
    ended(replyId, head?.index ?? -1, true)
  }

  /** What went to the speaker since the last tick, in frames, for the echo check. */
  const publishFrames = (runtime: VoiceRuntimeHandle, replyId: string, fresh = playback?.heardAudio?.()) => {
    if (!fresh || fresh.length === 0) return
    const all = new Int16Array(frameCarry.length + fresh.length)
    all.set(frameCarry)
    all.set(fresh, frameCarry.length)
    let at = 0
    for (; at + FRAME <= all.length; at += FRAME) {
      runtime.publish({ kind: 'playback.frame', replyId, pcm: all.slice(at, at + FRAME), t: runtime.now() })
    }
    frameCarry = all.slice(at)
  }

  const follow = () => {
    if (!following || !playback) return
    const head = playback.position()
    const runtime = publish()
    if (runtime && head && !playback.idle()) {
      runtime.publish({
        kind: 'playback.at', replyId: spokenTurnId ?? '', index: head.index, elapsedMs: head.elapsed * 1000,
        ended: head.ended, playing: true, t: now(),
      })
      publishFrames(runtime, spokenTurnId ?? '')
    }
    const reveal = snapshot().reveal
    if (reveal && head && (!reveal.head || reveal.head.index !== head.index || reveal.head.ended !== head.ended
      || Math.abs(reveal.head.elapsed - head.elapsed) >= 0.03)) {
      set({ reveal: { ...reveal, head }, phase: 'speaking' })
    }
    if (turnFinished && playback.idle()) finishSpeaking()
  }

  const heardPhrase = (runtime: VoiceRuntimeHandle, heard: Heard & { lineId?: string; backchannel?: true }) => {
    publishFrames(runtime, '', heard.audio)
    runtime.publish({
      kind: 'phrase.at', text: heard.text, playing: heard.playing, ...(heard.lineId && { lineId: heard.lineId }),
      ...(heard.backchannel && { backchannel: true }), t: runtime.now(),
    })
    if (heard.lineId && heard.playing) heading.lineStarted(heard.lineId, heard.text)
    if (heard.playing) return
    frameCarry = new Int16Array(0)
    if (waiting.length && mayPlay()) playWaiting()
  }

  /**
   * The reply playing stops, and hq hears how far the person listened: the sentences heard to their end, and the
   * words heard of the next. Its text shows only that far (`heardCut`) until hq's record of it holds the same cut.
   */
  const stopReply = (conversationId: string) => {
    const turnId = spokenTurnId
    const head = playback?.position() ?? null
    const heard = playback?.stop() ?? -1
    const reveal = snapshot().reveal
    const sentences = reveal?.turnId === turnId ? reveal.sentences : []
    const next = head?.index === heard + 1 ? sentences.find(s => s.index === head.index) : undefined
    const words = next && head ? wordsHeard(next, head.elapsed).spoken : 0
    playback = null
    following = false
    turnFinished = false
    frameCarry = new Int16Array(0)
    spokenTurnId = null
    if (turnId) {
      dropped.add(turnId)
      clearFirstSentence(turnId)
      forget(turnId, true)
      deps.hq.interrupt(conversationId, turnId, heard, words)
      setHeardCut({ turnId, sentences, head, ...(reveal?.heardPrefix && reveal.turnId === turnId && { heardPrefix: reveal.heardPrefix }) })
    }
    set({ phase: 'listening', reveal: reveal?.turnId === turnId ? null : reveal })
    ended(turnId, heard, false)
    if (turnId) publish()?.publish({ kind: 'orchestration.cancel', replyId: turnId, heardThrough: heard, t: now() })
  }

  /** The person spoke over the reply, or tapped stop. */
  const bargeIn = () => {
    const snap = snapshot()
    if (!playback || snap.phase !== 'speaking' || !snap.conversationId) return
    stopReply(snap.conversationId)
  }

  const turnIdOf = (w: Waiting) => w.e.turnId
  /**
   * A reply not yet playing waits while the person holds the floor, has words not yet sent, or a stored phrase
   * plays. Their voice can be missed as the phrase's echo, so the floor alone is not enough.
   */
  const mayPlay = () => !PERSONS.has(floor) && !unsent && !sounds.busy()
  const mustWait = (turnId: string) =>
    turnId !== spokenTurnId && (!mayPlay() || waiting.some(w => turnIdOf(w) === turnId))

  const playSentence = (e: VoiceSentenceEvent) => {
    if (!playback) { playback = deps.createPlayback(); turnFinished = false }
    spokenTurnId = e.turnId
    playedTurns.add(e.turnId)
    publish()?.publish({
      kind: 'reply.sentence', replyId: e.turnId, index: e.index, text: e.text, ...(e.encouragement && { encouragement: true }), t: now(),
    })
    if (snapshot().reveal?.turnId !== e.turnId) holdReply(e.turnId)
    clearFirstSentence(e.turnId)
    const reveal = snapshot().reveal!
    if (reveal.sentences.some(s => s.index === e.index)) return
    set({ reveal: { ...reveal, sentences: [...reveal.sentences, e] }, phase: 'speaking' })
    following = true
  }
  const playAudio = (e: VoiceAudioEvent) => {
    if (!playback || e.turnId !== spokenTurnId) return
    playback.enqueue(e.index, bufferOf(e.audio))
  }
  const playTurnSpoken = (e: VoiceTurnSpokenEvent) => {
    if (!playback || e.turnId !== spokenTurnId) return
    playback.finish()
    turnFinished = true
    publish()?.publish({ kind: 'reply.spoken', replyId: e.turnId, sentences: e.sentences, t: now() })
  }

  /** The floor is the agent's again: what waited plays. */
  const playWaiting = () => {
    const held = waiting
    waiting = []
    for (const w of held) {
      if (dropped.has(turnIdOf(w))) continue
      if (w.kind === 'sentence') playSentence(w.e)
      else if (w.kind === 'audio') playAudio(w.e)
      else playTurnSpoken(w.e)
    }
  }

  const onPlayback = (action: 'duck' | 'stop' | 'resume') => {
    const settings = publish()?.settings().bargeIn
    if (action === 'stop') bargeIn()
    else if (action === 'duck') playback?.duck?.(settings?.duckDb ?? 15, settings?.duckRampMs ?? 50)
    else playback?.resume?.(settings?.resumeRampMs ?? 300)
  }

  const adapter: Adapter = {
    name: 'speaker',
    start(runtime) {
      const offs = [
        runtime.subscribe(['clock.tick'], () => { follow(); sounds.tick() }),
        runtime.subscribe(['orchestration.phrase'], e => {
          if (e.kind === 'orchestration.phrase' && runtime.settings().adaptiveVoice) sounds.requested(e, runtime)
        }),
        runtime.subscribe(['listen.play'], e => { if (e.kind === 'listen.play') sounds.allowLine(e.lineId, e.quiet) }),
        runtime.subscribe(['listen.drop'], e => { if (e.kind === 'listen.drop') sounds.dropLine(e.lineId) }),
        runtime.subscribe(['backchannel.sound'], e => { if (e.kind === 'backchannel.sound') sounds.hum(runtime, e) }),
        runtime.subscribe(['listen.answer'], e => { if (e.kind === 'listen.answer' && e.turn === 'closed' && !e.off) heading.closed(e.lineId, e.turnId) }),
        runtime.subscribe(['orchestration.playback'], e => { if (e.kind === 'orchestration.playback') onPlayback(e.action) }),
        runtime.subscribe(['orchestration.floor'], e => {
          if (e.kind !== 'orchestration.floor') return
          floor = e.state
          if (floor === 'person-speaking') sounds.personSpeaks()
          if (PERSONS.has(floor)) sounds.personHolds()
          else if (waiting.length && mayPlay()) playWaiting()
        }),
        runtime.subscribe(['stt.utterance'], e => {
          if (e.kind !== 'stt.utterance') return
          unsent = e.text.trim() !== ''
          if (!unsent && waiting.length && mayPlay()) playWaiting()
        }),
        // The person's words joined the message the waiting reply answers: hq cancels it, and it is never heard.
        runtime.subscribe(['orchestration.send'], e => {
          if (e.kind !== 'orchestration.send') return
          unsent = false
          const settings = runtime.settings()
          if (settings.adaptiveVoice && !settings.voiceListener) sounds.arm(e.t, settings.standardAcknowledgement, e.trailedOff)
          if (!e.append) return
          for (const w of waiting) { dropped.add(turnIdOf(w)); release(turnIdOf(w), false) }
          waiting = []
        }),
      ]
      return () => { for (const off of offs) off() }
    },
  }

  return {
    adapter,
    /**
     * The person is ending the call: the reply playing keeps only what was heard of it, and one held for its voice,
     * none of it — hq is told before the call ends, so it stops the turn the same way speaking over it does.
     */
    endCall() {
      const conversationId = snapshot().conversationId
      if (!conversationId) return
      if (playback && spokenTurnId) { stopReply(conversationId); return }
      const reveal = snapshot().reveal
      if (!reveal || dropped.has(reveal.turnId)) return
      dropped.add(reveal.turnId)
      forget(reveal.turnId)
      deps.hq.interrupt(conversationId, reveal.turnId, -1, 0)
      setHeardCut({ turnId: reveal.turnId, sentences: reveal.sentences, head: null, ...(reveal.heardPrefix && { heardPrefix: reveal.heardPrefix }) })
      release(reveal.turnId)
    },
    sentence(e: VoiceSentenceEvent) {
      if (dropped.has(e.turnId)) return
      sounds.disarm()
      if (mustWait(e.turnId)) { waiting.push({ kind: 'sentence', e }); return }
      playSentence(e)
    },
    audio(e: VoiceAudioEvent) {
      if (dropped.has(e.turnId)) return
      if (mustWait(e.turnId)) { waiting.push({ kind: 'audio', e }); return }
      playAudio(e)
    },
    /** The lines heard that the reply's message starts with: they show whole, and the reply's words follow in step. */
    heardPrefix(e: VoiceHeardPrefixEvent) {
      if (dropped.has(e.turnId)) return
      const reveal = snapshot().reveal
      heardPrefixes.set(e.turnId, e.text)
      if (reveal?.turnId === e.turnId) set({ reveal: { ...reveal, heardPrefix: e.text } })
    },
    turnSpoken(e: VoiceTurnSpokenEvent) {
      if (dropped.has(e.turnId)) return
      if (mustWait(e.turnId)) { waiting.push({ kind: 'turnSpoken', e }); return }
      if (e.sentences === 0 && !playedTurns.has(e.turnId)) { nothingSpoken(e.turnId); return }
      playTurnSpoken(e)
    },
    /** The reply's first text: the reply has started, and it is held back until its audio is heard. */
    delta(e: ConversationDeltaEvent) {
      if (dropped.has(e.turnId)) return
      sounds.disarm()
      if (!seenTurns.has(e.turnId)) holdReply(e.turnId)
    },
    /**
     * hq held the turn: the agent judged the person had not finished, so no reply comes. Anything of it already here
     * is never heard, the floor is free, and the scheduler keeps the message open for their next words.
     */
    held(e: VoiceTurnHeldEvent) {
      sounds.disarm()
      dropped.add(e.turnId)
      waiting = waiting.filter(w => turnIdOf(w) !== e.turnId)
      if (spokenTurnId === e.turnId) {
        playback?.stop(); playback = null; following = false; turnFinished = false; spokenTurnId = null
        frameCarry = new Int16Array(0)
        ended(e.turnId, -1, false)
      }
      release(e.turnId, false)
      publish()?.publish({ kind: 'reply.held', replyId: e.turnId, t: now() })
      if (snapshot().phase === 'thinking' || snapshot().phase === 'speaking') set({ phase: 'listening' })
    },
    /** A turn runs: the lines heard head its bubble until hq says which head its message. */
    running(turnId: string) { if (!dropped.has(turnId)) heading.running(turnId) },
    turn(e: ConversationTurnEvent) {
      const waits = waiting.some(w => turnIdOf(w) === e.turnId)
      const unheard = !playedTurns.has(e.turnId) && !dropped.has(e.turnId) && !waits
      // A turn that completed with no reply of its own (one a line closed, recorded before its answer comes) keeps the
      // lines it holds: they are in its message.
      const closedAlone = e.state === 'COMPLETED' && !seenTurns.has(e.turnId)
      if (snapshot().reveal?.turnId !== e.turnId && !waits && !closedAlone) forget(e.turnId)
      // Completed, with its speech still to come — not here yet, or waiting for a line or the person to finish: held until
      // it is heard or hq says none will be. Shown whole meanwhile, its words would run ahead of the voice.
      if (e.state === 'COMPLETED' && unheard && seenTurns.has(e.turnId)) return
      if (e.state === 'COMPLETED' && speechWaits(e.turnId)) {
        if (snapshot().phase === 'thinking') set({ phase: 'listening' })
        return
      }
      // The turn ended with none of it spoken: the floor is free again.
      if (unheard) {
        sounds.disarm()
        publish()?.publish({ kind: 'reply.spoken', replyId: e.turnId, sentences: 0, t: now() })
      }
      const reveal = snapshot().reveal
      // It failed or was interrupted: show what the record holds.
      if (reveal?.turnId === e.turnId && (reveal.sentences.length === 0 || e.state !== 'COMPLETED')) release(e.turnId)
      if (snapshot().phase === 'thinking') set({ phase: 'listening' })
    },
    /** Speech failed in the middle of a reply: it is shown as written. */
    failed() {
      sounds.failed()
      const turnId = snapshot().reveal?.turnId
      if (!turnId) return
      const replyId = spokenTurnId
      playback?.stop(); playback = null; following = false; release(turnId); spokenTurnId = null
      ended(replyId, -1, false)
    },
    /** A stored phrase in the agent's voice, sent by hq as voice starts. */
    phrase(e: VoicePhraseEvent) { sounds.phrase(e) },
    /** A light model's line: it plays once its answer allows it. */
    line(e: VoiceLineEvent) { sounds.line(e) },
    /** A sound the keeper asked hq for (`../backchannel/keeper`). */
    sound(e: VoiceBackchannelSoundEvent) { const runtime = deps.runtime(); if (runtime) sounds.sound(e, runtime) },
    reset() {
      sounds.reset()
      heading.reset()
      heardPrefixes.clear()
      following = false
      clearFirstSentence()
      playback?.close(); playback = null
      seenTurns.clear()
      playedTurns.clear()
      dropped.clear()
      waiting = []
      floor = 'open'
      unsent = false
      frameCarry = new Int16Array(0)
      spokenTurnId = null; turnFinished = false
    },
  }
}

export type Speaker = ReturnType<typeof createSpeaker>
