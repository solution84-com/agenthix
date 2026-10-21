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
 * While a reply is awaited, a filler phrase (`./fillerPhrases`) may play: heard like a reply for the echo check, it is
 * no reply, and a reply that arrives meanwhile waits for it to end. Active listening and encouragement phrases
 * (`./listenerPhrases`) play the same way, when Orchestration asks, while the person holds the floor; their speaking
 * stops one.
 */
import type {
  ConversationDeltaEvent, ConversationTurnEvent, VoiceAudioEvent, VoicePhraseEvent, VoiceSentenceEvent,
  VoiceTurnSpokenEvent,
} from '../../../shared/conversations/protocol'
import type { FloorState } from '../events'
import type { Playback, Playhead } from '../playback'
import type { Adapter, VoiceRuntimeHandle } from '../runtime/types'
import type { VoiceSnapshot } from '../voiceSnapshot'
import { createFillerPhrases, type Heard } from './fillerPhrases'
import { createListenerPhrases } from './listenerPhrases'
import type { HqVoice } from './hqSocket'

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

function bufferOf(audio: unknown): ArrayBuffer {
  if (audio instanceof ArrayBuffer) return audio
  const view = audio as { buffer: ArrayBuffer; byteOffset: number; byteLength: number }
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
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
  const filler = createFillerPhrases({ createPlayback: deps.createPlayback, random: deps.random })
  const listener = createListenerPhrases({ createPlayback: deps.createPlayback, random: deps.random })

  const now = () => deps.runtime()?.now() ?? Date.now()
  const publish = deps.runtime
  /** Playback has ended for this reply; `ended` when it was heard to its end. */
  const ended = (replyId: string | null, index: number, heardToEnd: boolean) => {
    publish()?.publish({ kind: 'playback.at', replyId: replyId ?? '', index, elapsedMs: 0, ended: heardToEnd, playing: false, t: now() })
  }

  const clearFirstSentence = (turnId?: string) => {
    for (const [id, t] of firstSentence) if (!turnId || id === turnId) { clearTimeout(t); firstSentence.delete(id) }
  }
  const release = (turnId: string) => {
    clearFirstSentence(turnId)
    if (snapshot().reveal?.turnId === turnId) set({ reveal: null })
  }
  /** Nothing of the reply will be heard: its text shows whole, and the floor is free. */
  const nothingSpoken = (turnId: string) => {
    filler.disarm()
    release(turnId)
    if (playedTurns.has(turnId)) return
    publish()?.publish({ kind: 'reply.spoken', replyId: turnId, sentences: 0, t: now() })
    if (snapshot().phase === 'thinking') set({ phase: 'listening' })
  }
  const holdReply = (turnId: string) => {
    seenTurns.add(turnId)
    set({ reveal: { turnId, head: null, sentences: [] } })
    firstSentence.set(turnId, setTimeout(() => {
      const reveal = snapshot().reveal
      if (reveal?.turnId === turnId && reveal.sentences.length === 0) nothingSpoken(turnId)
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

  const heardPhrase = (runtime: VoiceRuntimeHandle, heard: Heard) => {
    publishFrames(runtime, '', heard.audio)
    runtime.publish({ kind: 'phrase.at', text: heard.text, playing: heard.playing, t: runtime.now() })
    if (heard.playing) return
    frameCarry = new Int16Array(0)
    if (waiting.length && mayPlay()) playWaiting()
  }
  /** On each tick: the filler phrase starts when it is due and nothing else is heard, and is followed while it plays. */
  const followFiller = () => {
    const runtime = publish()
    if (!runtime) return
    const heard = filler.tick(runtime.now(), !PERSONS.has(floor) && !playback && snapshot().phase === 'thinking')
    if (heard) heardPhrase(runtime, heard)
  }
  const stopFiller = () => {
    const text = filler.cancel()
    const runtime = publish()
    if (text !== null && runtime) heardPhrase(runtime, { text, playing: false, audio: new Int16Array(0) })
  }
  const followListener = () => {
    const runtime = publish()
    const heard = listener.tick()
    if (heard && runtime) heardPhrase(runtime, heard)
  }
  const stopListener = () => {
    const text = listener.cancel()
    const runtime = publish()
    if (text !== null && runtime) heardPhrase(runtime, { text, playing: false, audio: new Int16Array(0) })
  }

  /** The person spoke over the reply, or tapped stop: the audio stops, and hq hears how far they listened. */
  const bargeIn = () => {
    const snap = snapshot()
    if (!playback || snap.phase !== 'speaking' || !snap.conversationId) return
    const turnId = spokenTurnId
    const heard = playback.stop()
    playback = null
    following = false
    turnFinished = false
    frameCarry = new Int16Array(0)
    if (turnId) { dropped.add(turnId); deps.hq.interrupt(snap.conversationId, turnId, heard) }
    // The text stays where the ear stopped until the turn's end replaces it with the record.
    const reveal = snap.reveal
    const frozen: Playhead | null = heard >= 0 ? { index: heard, elapsed: Infinity, ended: true } : null
    spokenTurnId = null
    set({ phase: 'listening', reveal: reveal ? { ...reveal, head: frozen } : null })
    ended(turnId, heard, false)
    if (turnId) publish()?.publish({ kind: 'orchestration.cancel', replyId: turnId, heardThrough: heard, t: now() })
  }

  const turnIdOf = (w: Waiting) => w.e.turnId
  /**
   * A reply not yet playing waits while the person holds the floor, has words not yet sent, or a stored phrase
   * plays. Their voice can be missed as the phrase's echo, so the floor alone is not enough.
   */
  const mayPlay = () => !PERSONS.has(floor) && !unsent && !filler.busy() && !listener.busy()
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
        runtime.subscribe(['clock.tick'], () => { follow(); followFiller(); followListener() }),
        runtime.subscribe(['orchestration.phrase'], e => {
          if (e.kind === 'orchestration.phrase' && !playback && !filler.busy()) listener.play(e.phrase, runtime.settings())
        }),
        runtime.subscribe(['orchestration.playback'], e => { if (e.kind === 'orchestration.playback') onPlayback(e.action) }),
        runtime.subscribe(['orchestration.floor'], e => {
          if (e.kind !== 'orchestration.floor') return
          floor = e.state
          if (floor === 'person-speaking') stopListener()
          if (PERSONS.has(floor)) stopFiller()
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
          filler.arm(e.t, runtime.settings().filler, e.trailedOff)
          if (!e.append) return
          for (const w of waiting) { dropped.add(turnIdOf(w)); release(turnIdOf(w)) }
          waiting = []
        }),
      ]
      return () => { for (const off of offs) off() }
    },
  }

  return {
    adapter,
    sentence(e: VoiceSentenceEvent) {
      if (dropped.has(e.turnId)) return
      filler.disarm()
      if (mustWait(e.turnId)) { waiting.push({ kind: 'sentence', e }); return }
      playSentence(e)
    },
    audio(e: VoiceAudioEvent) {
      if (dropped.has(e.turnId)) return
      if (mustWait(e.turnId)) { waiting.push({ kind: 'audio', e }); return }
      playAudio(e)
    },
    turnSpoken(e: VoiceTurnSpokenEvent) {
      if (dropped.has(e.turnId)) return
      if (mustWait(e.turnId)) { waiting.push({ kind: 'turnSpoken', e }); return }
      if (e.sentences === 0 && !playedTurns.has(e.turnId)) { nothingSpoken(e.turnId); return }
      playTurnSpoken(e)
    },
    /** The reply's first text: it is held back until its audio is heard. */
    delta(e: ConversationDeltaEvent) {
      if (!seenTurns.has(e.turnId) && !dropped.has(e.turnId)) holdReply(e.turnId)
    },
    turn(e: ConversationTurnEvent) {
      const unheard = !playedTurns.has(e.turnId) && !dropped.has(e.turnId) && !waiting.some(w => turnIdOf(w) === e.turnId)
      // Completed, with its speech still to come: held until it is heard or hq says none will be.
      if (e.state === 'COMPLETED' && unheard && seenTurns.has(e.turnId)) return
      // The turn ended with none of it spoken: the floor is free again.
      if (unheard) {
        filler.disarm()
        publish()?.publish({ kind: 'reply.spoken', replyId: e.turnId, sentences: 0, t: now() })
      }
      const reveal = snapshot().reveal
      // It failed or was interrupted: show what the record holds.
      if (reveal?.turnId === e.turnId && (reveal.sentences.length === 0 || e.state !== 'COMPLETED')) release(e.turnId)
      if (snapshot().phase === 'thinking') set({ phase: 'listening' })
    },
    /** Speech failed in the middle of a reply: it is shown as written. */
    failed() {
      stopFiller()
      stopListener()
      const turnId = snapshot().reveal?.turnId
      if (!turnId) return
      const replyId = spokenTurnId
      playback?.stop(); playback = null; following = false; release(turnId); spokenTurnId = null
      ended(replyId, -1, false)
    },
    /** A stored phrase in the agent's voice, sent by hq as voice starts. */
    phrase(e: VoicePhraseEvent) {
      const audio = bufferOf(e.audio)
      if (e.use === 'active-listening' || e.use === 'encouragement') listener.add({ text: e.text, audio, use: e.use })
      else filler.add({ text: e.text, audio, tier: e.tier })
    },
    reset() {
      filler.cancel()
      filler.clear()
      listener.clear()
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
