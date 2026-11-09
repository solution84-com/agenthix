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

/** What the speech service is asked to say for a phrase: with its direction where the model takes one. */
export function spokenAs(text: string, voice: AgentVoice, direction: string = PHRASE_DIRECTION): string {
  return DIRECTED_MODELS.has(voice.model) && direction ? `${direction} ${text}` : text
}

async function streamed(text: string, voice: AgentVoice): Promise<Buffer> {
  const parts: Buffer[] = []
  // Its outcome goes to the provider's health as a reply's speech does.
  for await (const { audio } of reported(voice.providerId, inworldTtsAdapter.synthesizeStream(text, voice))) parts.push(audio)
  return Buffer.concat(parts)
}

function fileOf(dir: string, voice: AgentVoice, text: string, direction?: string): string {
  const hash = crypto.createHash('sha1').update(`${voice.model}|${spokenAs(text, voice, direction)}`).digest('hex').slice(0, 16)
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

async function clipOf(
  { text, tier, use, direction }: { text: string; tier: number; use: PhraseUse; direction?: string }, voice: AgentVoice, synthesize: Synthesize, dir: string,
): Promise<PhraseClip | null> {
  const file = fileOf(dir, voice, text, direction)
  try {
    return { text, tier, use, audio: await fs.promises.readFile(file) }
  } catch { /* not made yet */ }
  try {
    const made = await synthesize(spokenAs(text, voice, direction), voice)
    if (!made.length) return null
    const audio = use === 'filler' ? made : withoutTail(made)
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    await fs.promises.writeFile(file, audio)
    return { text, tier, use, audio }
  } catch {
    return null
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

/** Everything to make as voice starts: the shortest filler phrases, then the listening family's clips, then the rest. */
export function storedPhrases(random: () => number = Math.random): { text: string; tier: number; use: PhraseUse; direction?: string }[] {
  const phrases = fillerPhrases(random).map(p => ({ ...p, use: 'filler' as const }))
  const listening = listeningPhrases()
  return [...phrases.filter(p => p.tier === 0), ...listening, ...phrases.filter(p => p.tier !== 0)]
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
