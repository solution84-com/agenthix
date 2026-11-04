/**
 * The stored phrases, in the agent's voice: the filler phrases (adaptive voice spec, Orchestration: the filler
 * phrases), and the active listening and encouragement phrases (Orchestration §5). They are made once per voice and
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
import { VOICE_SETTINGS } from '../voiceClient/settings'
import { reported } from './reportedSpeech'
import type { AgentVoice } from './speech'

export type PhraseClip = { text: string; tier: number; audio: Buffer; use: PhraseUse }
type PhraseUse = 'filler' | 'active-listening' | 'encouragement'
export type Synthesize = (text: string, voice: AgentVoice) => Promise<Buffer>
export type PhraseDeps = { synthesize?: Synthesize; dir?: () => string; random?: () => number }

/** The direction the phrases are made with, on the models that take one. */
export const PHRASE_DIRECTION = '[relaxed, low voice, thinking]'
const DIRECTED_MODELS: ReadonlySet<string> = new Set(['inworld-tts-2'])

/** What the speech service is asked to say for a phrase: with its direction where the model takes one. */
export function spokenAs(text: string, voice: AgentVoice): string {
  return DIRECTED_MODELS.has(voice.model) ? `${PHRASE_DIRECTION} ${text}` : text
}

async function streamed(text: string, voice: AgentVoice): Promise<Buffer> {
  const parts: Buffer[] = []
  // Its outcome goes to the provider's health as a reply's speech does.
  for await (const { audio } of reported(voice.providerId, inworldTtsAdapter.synthesizeStream(text, voice))) parts.push(audio)
  return Buffer.concat(parts)
}

function fileOf(dir: string, voice: AgentVoice, text: string): string {
  const hash = crypto.createHash('sha1').update(`${voice.model}|${spokenAs(text, voice)}`).digest('hex').slice(0, 16)
  return path.join(dir, 'phrases', voice.voiceId.replace(/[^a-zA-Z0-9_-]/g, '_'), `${hash}.pcm`)
}

async function clipOf(
  { text, tier, use }: { text: string; tier: number; use: PhraseUse }, voice: AgentVoice, synthesize: Synthesize, dir: string,
): Promise<PhraseClip | null> {
  const file = fileOf(dir, voice, text)
  try {
    return { text, tier, use, audio: await fs.promises.readFile(file) }
  } catch { /* not made yet */ }
  try {
    const audio = await synthesize(spokenAs(text, voice), voice)
    if (!audio.length) return null
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

/** Everything to make as voice starts: the shortest filler phrases, then the active listening and encouragement ones, then the rest. */
export function storedPhrases(random: () => number = Math.random): { text: string; tier: number; use: PhraseUse }[] {
  const phrases = fillerPhrases(random).map(p => ({ ...p, use: 'filler' as const }))
  const listening = [
    ...VOICE_SETTINGS.activeListening.phrases.map(text => ({ text, tier: 0, use: 'active-listening' as const })),
    ...VOICE_SETTINGS.encouragement.phrases.map(text => ({ text, tier: 0, use: 'encouragement' as const })),
  ]
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
