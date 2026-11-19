/**
 * The hum set's tellings (adaptive voice listening, spec §The backchannel): seven things a person tells, each with the
 * points marked where a listener would hum, and with which kind and tone; mid-sentence, and after a question to the
 * listener, the right answer is `none`. A `|` in the words marks a point; the mark's index is the point's order.
 *
 * The words read as the live speech-to-text transcript does (the owner's playtest of 18 Nov): a sentence they finished
 * mid-turn ends in a comma or nothing, and a cut, the words shown at that moment, has no final punctuation.
 */
import type { HumKind, HumTone } from '../../../voiceClient/backchannel/kinds'

/** What a point wants: a kind (`none` for no hum) and the tones that fit; `near`: kinds counted apart, as close. */
export type HumMark = { kind: HumKind | 'none'; tones?: readonly HumTone[]; near?: readonly HumKind[] }

export type Telling = { id: string; title: string; words: string; marks: readonly HumMark[] }

export const TELLINGS: readonly Telling[] = [
  {
    id: 'hiking', title: 'The hiking story, with "twisted her ankle"',
    words: 'So last weekend I went hiking up at the falls | We left really early, about 6 in the morning, | Then it got | steep and my friend twisted her ankle | So we had to walk her all the | way back down',
    marks: [
      { kind: 'continuer', tones: ['calm', 'curious'], near: ['receipt'] },
      // The owner's playtest of 18 Nov: a finished clause of a telling, where the hum service said none.
      { kind: 'continuer', tones: ['calm', 'curious'], near: ['receipt'] },
      { kind: 'none' },
      { kind: 'sympathy', tones: ['gentle'] },
      { kind: 'none' },
    ],
  },
  {
    id: 'launch', title: 'The launch news',
    words: "Just so you know, the launch moved | It's now on the fourteenth instead of the tenth, | because the payment | provider needs another week",
    marks: [
      { kind: 'news', tones: ['calm', 'curious'], near: ['receipt', 'realisation'] },
      { kind: 'receipt', tones: ['calm'], near: ['news', 'continuer'] },
      { kind: 'none' },
    ],
  },
  {
    // The owner's playtest of 18 Nov: news, where the hum service said none.
    id: 'launch-moved', title: 'The launch moved, said as news',
    words: "That's okay, just so you know I moved the launch to next Friday | Marketing asked for more time",
    marks: [{ kind: 'news', tones: ['calm', 'curious'], near: ['receipt', 'realisation'] }],
  },
  {
    id: 'packing', title: 'The packing list, then a question',
    words: "For the trip I've packed the tent, | the stove, two sleeping bags and enough food for three days | Did I forget anything? |",
    marks: [
      { kind: 'continuer', tones: ['calm'], near: ['receipt'] },
      { kind: 'receipt', tones: ['calm'], near: ['continuer'] },
      { kind: 'none' },
    ],
  },
  {
    id: 'dilemma', title: 'A dilemma: "I was thinking we could…"',
    words: "I've been going back and forth on this | I was thinking we could | move the team offsite to March, | but then half | of them are on leave",
    marks: [
      { kind: 'thoughtful', tones: ['thoughtful', 'calm'], near: ['continuer'] },
      { kind: 'none' },
      { kind: 'thoughtful', tones: ['thoughtful'], near: ['continuer', 'receipt'] },
      { kind: 'none' },
    ],
  },
  {
    id: 'good-news', title: 'Good news',
    words: 'Guess what, I finally heard back from them | I got the job | I start on Monday |',
    marks: [
      { kind: 'continuer', tones: ['curious'], near: ['news'] },
      { kind: 'delight', tones: ['bright'], near: ['news'] },
      { kind: 'delight', tones: ['bright', 'warm'], near: ['news', 'receipt'] },
    ],
  },
  {
    id: 'question-at-end', title: 'A question at the end',
    words: "I've been looking at the numbers for last quarter, | and something doesn't add up | Can you tell me why revenue dropped? |",
    marks: [
      { kind: 'continuer', tones: ['calm'], near: ['receipt'] },
      { kind: 'continuer', tones: ['curious', 'calm'], near: ['thoughtful', 'news'] },
      { kind: 'none' },
    ],
  },
]

/** Words a second, a calm telling's pace. */
export const WORDS_PER_SECOND = 2.5

export type Cut = { atMs: number; text: string; mark: number | null }

/**
 * A telling cut into its words as they grow, second by second, and at each marked point: what the page would send at
 * each moment, with no final punctuation. A cut at a point carries its mark's index.
 */
export function cutsOf(telling: Telling): Cut[] {
  const words: string[] = []
  const marksAt = new Map<number, number>()
  for (const token of telling.words.split(/\s+/).filter(Boolean)) {
    if (token === '|') marksAt.set(words.length, marksAt.size)
    else words.push(token)
  }
  const atOf = (n: number) => Math.round((n / WORDS_PER_SECOND) * 1000)
  const shown = (n: number) => words.slice(0, n).join(' ').replace(/[.,!;:]+$/, '')
  const cuts = new Map<number, Cut>()
  for (let s = 1; atOf(words.length) >= s * 1000; s++) {
    const n = Math.floor(s * WORDS_PER_SECOND)
    cuts.set(n, { atMs: s * 1000, text: shown(n), mark: null })
  }
  for (const [n, mark] of marksAt) cuts.set(n, { atMs: atOf(n), text: shown(n), mark })
  return [...cuts.values()].filter(c => c.text).sort((a, b) => a.atMs - b.atMs)
}
