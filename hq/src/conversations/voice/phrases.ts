/**
 * The stored phrases, in the agent's voice: the filler phrases (adaptive voice spec, Orchestration: the filler
 * phrases), kept for the standard acknowledgement, and the listening family's clips in three tiers (voice that stays
 * in the conversation, spec §3: hums, acknowledging words, invitations). They are made once per voice and
 * kept on disk beside the voice previews, and handed on one by one as voice starts, so the browser can say one at
 * once while a reply is still being written. The filler mixes, an opening and an ending, are drawn afresh each time
 * voice starts, so a session hears a different few; each opening and each ending is in only one of them. They are
 * made one at a time: the speech service limits how many requests run at once, and a reply's speech must never wait
 * for them. A phrase that cannot be made is left out.
 *
 * On a model that takes a spoken direction (Inworld TTS-2), each is made with one, so they sound relaxed and low
 * beside the reply instead of bright: "Alright," and "Sure," made plainly broke the person's train of thought.
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getVoiceCacheDir } from '../../server/hqStoragePaths'
import { inworldTtsAdapter } from '../../voice/inworldAdapter'
import { LISTENING_CLIPS, type ListeningUse } from '../voiceClient/orchestration/listeningTiers'
import { VOICE_SETTINGS } from '../voiceClient/settings'
import { reported } from './reportedSpeech'
import type { AgentVoice } from './speech'

export type PhraseClip = { text: string; tier: number; audio: Buffer; use: PhraseUse }
type PhraseUse = 'filler' | ListeningUse
export type Synthesize = (text: string, voice: AgentVoice) => Promise<Buffer>
export type PhraseDeps = { synthesize?: Synthesize; dir?: () => string; random?: () => number }

/** The direction the phrases are made with, on the models that take one. */
export const PHRASE_DIRECTION = '[relaxed, low voice, thinking]'
const DIRECTED_MODELS: ReadonlySet<string> = new Set(['inworld-tts-2'])

/** The speech model takes a spoken direction in square brackets. */
export const takesDirection = (voice: Pick<AgentVoice, 'model'>): boolean => DIRECTED_MODELS.has(voice.model)

/** What the speech service is asked to say for a phrase: with its direction where the model takes one. */
export function spokenAs(text: string, voice: AgentVoice, direction: string = PHRASE_DIRECTION): string {
  return takesDirection(voice) && direction ? `${direction} ${text}` : text
}

async function streamed(text: string, voice: AgentVoice): Promise<Buffer> {
  const parts: Buffer[] = []
  // Its outcome goes to the provider's health as a reply's speech does.
  for await (const { audio } of reported(voice.providerId, inworldTtsAdapter.synthesizeStream(text, voice))) parts.push(audio)
  return Buffer.concat(parts)
}

function fileOf(dir: string, voice: AgentVoice, said: string): string {
  const hash = crypto.createHash('sha1').update(`${voice.model}|${said}`).digest('hex').slice(0, 16)
  return path.join(dir, 'phrases', voice.voiceId.replace(/[^a-zA-Z0-9_-]/g, '_'), `${hash}.pcm`)
}

/** A listening clip without the silence the speech service leaves after the sound (half a second), so it ends when it sounds like it does. PCM16 mono at 24 kHz. */
export function withoutTail(audio: Buffer, keepMs = 80): Buffer {
  const window = 480
  const samples = new Int16Array(audio.buffer, audio.byteOffset, Math.floor(audio.length / 2))
  let end = 0
  for (let i = 0; i + window <= samples.length; i += window) {
    let sum = 0
    for (let j = 0; j < window; j++) sum += samples[i + j]! * samples[i + j]!
    if (Math.sqrt(sum / window) / 32768 > 0.01) end = i + window
  }
  const keep = Math.min(samples.length, end + Math.round((keepMs / 1000) * 24_000))
  return end === 0 ? audio : audio.subarray(0, keep * 2)
}

/** A phrase is its words with its direction. */
type Wanted = { text: string; tier: number; use: PhraseUse; direction?: string }

/** A backchannel sound without the silence the speech service leaves before and after it: it plays at once, and ends when it sounds like it does. PCM16 mono at 24 kHz. */
export function withoutSilence(audio: Buffer, leadMs = 20, keepMs = 80): Buffer {
  const window = 480
  const samples = new Int16Array(audio.buffer, audio.byteOffset, Math.floor(audio.length / 2))
  let start = -1
  for (let i = 0; i + window <= samples.length && start < 0; i += window) {
    let sum = 0
    for (let j = 0; j < window; j++) sum += samples[i + j]! * samples[i + j]!
    if (Math.sqrt(sum / window) / 32768 > 0.01) start = i
  }
  if (start < 0) return audio
  const from = Math.max(0, start - Math.round((leadMs / 1000) * 24_000))
  const tail = withoutTail(audio.subarray(from * 2), keepMs)
  return tail
}

/** The recordings being made now, by file: voice start and the warming both reach for the same ones at once, and each is made once. */
const making = new Map<string, Promise<Buffer | null>>()

async function made(file: string, said: string, wanted: Wanted, voice: AgentVoice, synthesize: Synthesize): Promise<Buffer | null> {
  try {
    const raw = await synthesize(said, voice)
    if (!raw.length) return null
    const audio = wanted.use === 'filler' ? raw : withoutTail(raw)
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    await fs.promises.writeFile(file, audio)
    return audio
  } catch {
    return null
  }
}

async function clipOf(wanted: Wanted, voice: AgentVoice, synthesize: Synthesize, dir: string, fresh = false): Promise<PhraseClip | null> {
  const { text, tier, use, direction } = wanted
  const said = spokenAs(text, voice, direction)
  const file = fileOf(dir, voice, said)
  const clip = (audio: Buffer): PhraseClip => ({ text, tier, use, audio })
  const pending = making.get(file)
  if (pending) {
    const audio = await pending
    return audio ? clip(audio) : null
  }
  const kept = async () => {
    try {
      if (!fresh) return await fs.promises.readFile(file)
    } catch { /* not made yet */ }
    return made(file, said, wanted, voice, synthesize)
  }
  // Set before anything is awaited, so a second ask for the same file waits for this one.
  const audio = kept()
  making.set(file, audio)
  try {
    const ready = await audio
    return ready ? clip(ready) : null
  } finally {
    making.delete(file)
  }
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const kept = out[i]!
    out[i] = out[j]!
    out[j] = kept
  }
  return out
}

/** This session's phrases by tier: each step's own, and for the first step with none, the mixes. */
export function fillerPhrases(random: () => number = Math.random): { text: string; tier: number }[] {
  const { steps, mix } = VOICE_SETTINGS.filler
  const mixTier = steps.findIndex(s => s.phrases.length === 0)
  const openings = shuffled(mix.openings, random)
  const endings = shuffled(mix.endings, random)
  const mixes = openings.slice(0, Math.min(mix.perSession, endings.length)).map((o, i) => `${o} ${endings[i]}`)
  return steps.flatMap((step, tier) => (tier === mixTier ? mixes : step.phrases).map(text => ({ text, tier })))
}

/** The listening family's clips, the hums first, then the invitations, then the acknowledging words. */
export function listeningPhrases(): { text: string; tier: number; use: ListeningUse; direction: string }[] {
  const s = VOICE_SETTINGS.listening
  return [LISTENING_CLIPS.hum, LISTENING_CLIPS.invitation, LISTENING_CLIPS.acknowledge].flatMap(({ use, tier, texts, directions }) => {
    const spoken = directions(s)
    const n = Math.max(1, spoken.length)
    return texts(s).flatMap((text, i) => Array.from({ length: Math.min(s.tonesPerText, n) }, (_, v) => ({
      text, tier, use, direction: spoken[(i + v * 3) % n] ?? PHRASE_DIRECTION,
    })))
  })
}

/** Everything to make as voice starts: the shortest filler phrases, the listening family's clips, then the other fillers. */
export function storedPhrases(random: () => number = Math.random): Wanted[] {
  const phrases = fillerPhrases(random).map(p => ({ ...p, use: 'filler' as const }))
  return [...phrases.filter(p => p.tier === 0), ...listeningPhrases(), ...phrases.filter(p => p.tier !== 0)]
}

/** Each clip as it is ready, the shortest first, until `stillWanted` says voice has ended. */
export async function phraseClips(
  voice: AgentVoice,
  onClip: (clip: PhraseClip) => void,
  stillWanted: () => boolean = () => true,
  deps: PhraseDeps = {},
): Promise<void> {
  const synthesize = deps.synthesize ?? streamed
  const dir = (deps.dir ?? getVoiceCacheDir)()
  for (const wanted of storedPhrases(deps.random)) {
    if (!stillWanted()) return
    const clip = await clipOf(wanted, voice, synthesize, dir)
    if (clip && stillWanted()) onClip(clip)
  }
}

/**
 * The stored hold phrases (adaptive voice listening, spec §When a turn ends): only the fallback, when the light model
 * gave no usable answer in time, so the heavy model has the turn and the person hears that it does. Generic, the same
 * for every agent, short, in the agent's voice; none promises, answers or names what was asked.
 */
export const HOLD_PHRASES: readonly string[] = [
  'Okay, bear with me.', 'One moment.', 'Give me a second.', 'Let me think.', 'Just a sec.', 'On it.',
  "Okay, let me see.", 'Right, one moment.', 'Mm, let me think about that.', "Okay, I'm on it.",
  'Let me work that out.', 'Hmm, give me a moment.', 'Okay, thinking it through.', "Won't be long.",
  'Let me pull that together.', 'Right, let me look.', 'Okay, just a moment.', 'Bear with me a second.',
  'Let me have a look.', 'Okay, one sec.', 'Hmm, let me see.', 'Right, give me a moment.', 'Let me check.',
  'Okay, let me think about that.', 'Just a moment.', 'Mm, one moment.', 'Let me sort that out.', 'Okay, hang on.',
  'Right, let me think.', 'Give me a moment.', 'Let me just check.', 'Okay, give me a second.', 'Hmm, one sec.',
  'Let me figure that out.', 'Okay, working on it.', 'Right, bear with me.', 'Let me see what I can do.',
  'Okay, a moment.', 'Hmm, let me look.', 'Let me get that together.',
]

/**
 * The stored closing lines (adaptive voice listening, spec §When a turn ends): only at the "not yet" limit, when the
 * pause had an invitation nobody answered, so the turn closes without the heavy model and the person hears that the
 * agent is still there. Generic, short, in the agent's voice; none asks a question or says anything went wrong.
 */
export const CLOSING_PHRASES: readonly string[] = [
  "I'll be here when you're ready.", "No rush, I'm here when you're ready.", "Take your time, I'll be here.",
  "I'm here whenever you're ready.", 'No rush, just say when.', "Okay, I'll be right here.",
  "Whenever you're ready, I'm here.", "No hurry, I'm right here.",
]

/** The stored phrases hq plays on its own: the fallback's hold phrases, or the closing lines at the "not yet" limit. */
export type StoredPool = 'hold' | 'closing'

const POOLS: Record<StoredPool, readonly string[]> = { hold: HOLD_PHRASES, closing: CLOSING_PHRASES }

/** Each hold phrase's and closing line's clip, made one at a time and kept on disk: each then plays at once. */
export async function warmHoldPhrases(voice: AgentVoice, stillWanted: () => boolean = () => true, deps: PhraseDeps = {}): Promise<void> {
  const synthesize = deps.synthesize ?? streamed
  const dir = (deps.dir ?? getVoiceCacheDir)()
  const stored = [...HOLD_PHRASES, ...CLOSING_PHRASES].map(text => ({ text, tier: 0, use: 'filler' as const }))
  for (const wanted of stored) {
    if (!stillWanted()) return
    await clipOf(wanted, voice, synthesize, dir)
  }
}

/**
 * A stored phrase of `pool` none of `avoid` repeats, at random among those already made, so it plays at once; one is
 * made now only when none is. Null when none can be.
 */
export async function storedPhraseClip(
  voice: AgentVoice, pool: StoredPool, avoid: readonly string[], deps: PhraseDeps = {},
): Promise<{ text: string; audio: Buffer } | null> {
  const random = deps.random ?? Math.random
  const dir = (deps.dir ?? getVoiceCacheDir)()
  const all = POOLS[pool]
  const fresh = all.filter(p => !avoid.includes(p))
  const choices = shuffled(fresh.length ? fresh : [...all], random)
  for (const text of choices) {
    try {
      return { text, audio: await fs.promises.readFile(fileOf(dir, voice, spokenAs(text, voice))) }
    } catch { /* not made yet */ }
  }
  for (const text of choices.slice(0, 3)) {
    const clip = await clipOf({ text, tier: 0, use: 'filler' }, voice, deps.synthesize ?? streamed, dir)
    if (clip) return { text, audio: clip.audio }
  }
  return null
}

/** A stored hold phrase none of `avoid` repeats (`storedPhraseClip`). */
export const holdPhraseClip = (voice: AgentVoice, avoid: readonly string[], deps: PhraseDeps = {}) =>
  storedPhraseClip(voice, 'hold', avoid, deps)
