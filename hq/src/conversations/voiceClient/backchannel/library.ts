/**
 * The hum library (adaptive voice listening, spec §The listening read and §The sound keeper): the words each kind of
 * small sound of listening may be, and the tones each kind may take. The listening read answers only a kind and a
 * tone; the code picks the word from this list (`pickWord`), so nothing but these words is ever spoken as a hum.
 * Changing it is a code change the owner approves, as the hold phrases are.
 *
 * Never in it: a word of content, an opinion ("nice"), a question ("Really?") or an invitation ("Go on"), which belong
 * to the turn. Amusement is a laugh only.
 *
 * Each kind takes calm, so with Tone off (everything calm) every kind still has its words; a tone a kind does not take
 * falls to its first, its default.
 */
import { LAUGH_WORDS, type HumKind, type HumTone } from './kinds'

export type KindWords = {
  words: readonly string[]
  /** The tones it is made in; the first is its default, for a tone it does not take. */
  tones: readonly [HumTone, ...HumTone[]]
}

export const HUM_LIBRARY: Readonly<Record<HumKind, KindWords>> = {
  continuer: {
    words: ['Mm-hm.', 'Mhm.', 'Uh-huh.', 'Mm.', 'Yeah.', 'Mmm.', 'Yep.', 'Mm-hm, yeah.', 'Uh-huh, yeah.', 'Mm-hm, mm-hm.'],
    tones: ['calm', 'warm', 'curious', 'gentle'],
  },
  receipt: {
    words: ['Okay.', 'Right.', 'I see.', 'Got it.', 'Mm, okay.', 'Okay, right.', 'Alright.', 'Mm, right.', 'Right, okay.', 'Okay, got it.'],
    tones: ['calm', 'warm', 'thoughtful'],
  },
  news: {
    words: ['Oh.', 'Ah.', 'Oh, okay.', 'Oh, right.', 'Ah, okay.', 'Oh, yeah.', 'Oh, alright.', 'Ah, alright.', 'Oh, huh.', 'Oh, hm.'],
    tones: ['calm', 'curious', 'bright'],
  },
  realisation: {
    words: ['Ahh.', 'Ah, I see.', 'Oh, I see.', 'Ah, right.', 'Oh, got it.', 'Aha.', 'I see now.', 'Ah, gotcha.', 'Oh, right, right.', 'Ohh.'],
    tones: ['calm', 'warm', 'curious'],
  },
  thoughtful: {
    words: ['Hmm.', 'Hmmm…', 'Mm…', 'Huh.', 'Hm, okay.', 'Hmm, okay.', 'Hm.', 'Hmm, right.', 'Huh, okay.', 'Mm, hmm.'],
    tones: ['thoughtful', 'calm'],
  },
  agreement: {
    words: ['Yeah.', 'Right, right.', 'True.', 'Yeah, yeah.', 'Mm, yeah.', 'Yeah, true.', 'Mm, yep.', 'Mm, true.', 'Yep, yep.', 'Right.'],
    tones: ['calm', 'warm', 'bright'],
  },
  sympathy: {
    words: ['Oh no.', 'Aw.', 'Ouch.', 'Oh dear.', 'Oh, no…', 'Aww.', 'Oof.', 'Oh, man.', 'Oh, gosh.', 'Oh, ouch.'],
    tones: ['gentle', 'warm', 'calm'],
  },
  delight: {
    words: ['Ooh.', 'Wow.', 'Oh!', 'Oh, wow.', 'Ooh, yeah.', 'Whoa.', 'Ooh, wow.', 'Oh, yay.', 'Ah!', 'Wow, okay.'],
    tones: ['bright', 'warm', 'calm'],
  },
  amusement: { words: [LAUGH_WORDS], tones: ['bright'] },
}

/** A kind's tone for a read: the tone asked when the kind takes it, else the kind's default. */
export const toneFor = (kind: HumKind, tone: HumTone | null | undefined): HumTone =>
  (tone && HUM_LIBRARY[kind].tones.includes(tone) ? tone : HUM_LIBRARY[kind].tones[0])

/** Whether the kind takes this tone. */
export const takesTone = (kind: HumKind, tone: HumTone): boolean => HUM_LIBRARY[kind].tones.includes(tone)

/** Words compared without case or a trailing full stop or ellipsis. */
export const sameWords = (a: string, b: string): boolean => plain(a) === plain(b)
const plain = (words: string) => words.trim().toLowerCase().replace(/[.…!]+$/, '')

/** Whether `words` is one of the kind's words. */
export const isKindWord = (kind: HumKind, words: string): boolean => HUM_LIBRARY[kind].words.some(w => sameWords(w, words))

/**
 * The word to play for a kind at a breath: at random among `made` (the kind's words ready in that tone), never one of
 * `recent` (the last three played); null when none is left. A laugh is exempt from `recent`: there is only one.
 */
export function pickWord(kind: HumKind, made: readonly string[], recent: readonly string[], random: () => number): string | null {
  const fresh = kind === 'amusement' ? made : made.filter(w => !recent.some(r => sameWords(r, w)))
  if (fresh.length === 0) return null
  return fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))]!
}

/** The common sounds, handed to the page as voice starts: the continuers and receipts in calm, and a laugh. */
export const WARM_SOUNDS: readonly { kind: HumKind; tone: HumTone }[] = [
  { kind: 'continuer', tone: 'calm' }, { kind: 'receipt', tone: 'calm' }, { kind: 'amusement', tone: 'bright' },
]
