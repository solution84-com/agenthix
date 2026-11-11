/**
 * How much of a reply's written text the person has heard so far, so the bubble fills in step with the voice:
 * never ahead of it, nothing highlighted. The text is the whole reply as the lead wrote it; each sentence says
 * where in it its words appear (`textStart`, `textEnd`) and when each word is spoken.
 */
import type { VoiceSentenceEvent } from '../../shared/conversations/protocol'
import type { Playhead } from './playback'

export type TimedSentence = Pick<VoiceSentenceEvent, 'index' | 'textStart' | 'textEnd' | 'words' | 'wordStartSecs'>

/** Tokens that carry a word; the speech service also reports spaces and punctuation as tokens. */
const isWord = (token: string) => /\w/.test(token)

/** The end, in `text`, of the `count`-th whitespace-separated piece of `slice` starting at `from`. */
function endOfPiece(text: string, from: number, to: number, count: number): number {
  if (count <= 0) return from
  const pieces = [...text.slice(from, to).matchAll(/\S+/g)]
  if (pieces.length === 0) return from
  const hit = pieces[Math.min(count, pieces.length) - 1]!
  return from + hit.index! + hit[0].length
}

/** How many of a sentence's timed words have started by `elapsed` seconds into it, and how many it has. */
export function wordsHeard(sentence: Pick<TimedSentence, 'words' | 'wordStartSecs'>, elapsed: number): { spoken: number; timed: number } {
  const timed = sentence.words.map((w, i) => ({ w, at: sentence.wordStartSecs[i] ?? Infinity })).filter(t => isWord(t.w))
  return { spoken: timed.filter(t => t.at <= elapsed).length, timed: timed.length }
}

/**
 * Where, in `text`, the words heard of the sentence written at `start`–`end` end: `spoken` of its `timed` words,
 * mapped onto the written words in proportion. The screen reveals by it, and hq cuts a reply it stopped by it, so
 * both end on the same word. `start` when none was heard.
 */
export function heardEnd(text: string, start: number, end: number, spoken: number, timed: number): number {
  if (timed <= 0 || spoken <= 0) return start
  const pieces = [...text.slice(start, end).matchAll(/\S+/g)].length
  const upto = Math.floor((Math.min(spoken, timed) / timed) * pieces)
  return endOfPiece(text, start, end, upto)
}

export function revealedChars(text: string, sentences: Iterable<TimedSentence>, head: Playhead | null): number {
  if (!head) return 0
  const all = [...sentences].sort((a, b) => a.index - b.index)
  let chars = 0
  for (const s of all) {
    if (s.index < head.index) chars = Math.max(chars, s.textEnd)
  }
  const current = all.find(s => s.index === head.index)
  if (!current) return Math.min(chars, text.length)
  if (head.ended) return Math.min(Math.max(chars, current.textEnd), text.length)

  const { spoken, timed } = wordsHeard(current, head.elapsed)
  if (timed === 0 || spoken === 0) return Math.min(Math.max(chars, current.textStart), text.length)
  const end = heardEnd(text, current.textStart, current.textEnd, spoken, timed)
  return Math.min(Math.max(chars, end), text.length)
}

/** The part of `text` that may show: the first `limit` characters (what was heard so far), or all of it for null. */
export function revealedText(text: string, limit: number | null): string {
  return limit === null ? text : text.slice(0, limit)
}

/*
 * The reveal on screen runs a little ahead of the voice (`REVEAL.leadMs`), so a word is read just before it is heard.
 * That is only where the text shows; what was heard (above) stays what an interruption keeps.
 */

/** A sentence as hq sends it: each word's end too, so the reveal can glide through a word while it is said. */
type SpokenSentence = TimedSentence & { wordEndSecs?: number[] }

/** Each timed word's start and end, in seconds into its sentence. A word with no end ends when the next starts. */
function timedWords(s: SpokenSentence): { at: number; end: number }[] {
  const out: { at: number; end: number }[] = []
  s.words.forEach((w, i) => {
    if (!isWord(w)) return
    const at = s.wordStartSecs[i] ?? Infinity
    const next = s.wordStartSecs.slice(i + 1).find((t) => t > at)
    out.push({ at, end: Math.max(at, s.wordEndSecs?.[i] ?? next ?? at + 0.3) })
  })
  return out
}

/** When the sentence's last word ends: where the next sentence's audio is taken to begin. */
function spokenLength(s: SpokenSentence): number {
  const words = timedWords(s)
  return words.length === 0 ? 0 : words[words.length - 1]!.end
}

/**
 * Where in `text` the voice is `t` seconds into sentence `s`. The written words map onto the spoken ones as `heardEnd`
 * maps them: the written words that word `k` brings in glide in over the time word `k` is said; between words it holds.
 */
function placeIn(text: string, s: SpokenSentence, t: number): number {
  const pieces = [...text.slice(s.textStart, s.textEnd).matchAll(/\S+/g)].map((m) => ({ s: s.textStart + m.index!, e: s.textStart + m.index! + m[0].length }))
  const words = timedWords(s)
  if (pieces.length === 0 || words.length === 0) return s.textEnd
  let j = 0
  for (let k = 1; k <= words.length && j < pieces.length; k++) {
    // The written words shown once word `k` has started (`heardEnd`'s proportion): those it brings in.
    const upto = Math.floor((k / words.length) * pieces.length)
    if (upto <= j) continue
    const from = pieces[j]!.s
    const to = pieces[upto - 1]!.e
    const { at, end } = words[k - 1]!
    if (t < at) return from
    if (t < end) return from + ((t - at) / Math.max(1e-3, end - at)) * (to - from)
    j = upto
  }
  return s.textEnd
}

/**
 * Where the reveal heads: the place in `text` the voice will be `leadSecs` from the playhead, gliding through each word
 * over its spoken time and holding between words. It runs on into the next sentence, taken to begin where this one's
 * last word ends, but never past the text of the sentences hq has sent. 0 until the voice has begun.
 */
export function voiceTarget(text: string, sentences: Iterable<SpokenSentence>, head: Playhead | null, leadSecs: number): number {
  if (!head) return 0
  const all = [...sentences].sort((a, b) => a.index - b.index)
  const sent = Math.min(text.length, all.reduce((n, s) => Math.max(n, s.textEnd), 0))
  let shown = all.reduce((n, s) => (s.index < head.index ? Math.max(n, s.textEnd) : n), 0)
  let s = all.find((x) => x.index === head.index)
  let t = (s && head.ended ? spokenLength(s) : head.elapsed) + leadSecs
  while (s) {
    const length = spokenLength(s)
    const next = all.find((x) => x.index === s!.index + 1)
    if (t < length || !next) return Math.min(sent, Math.max(shown, placeIn(text, s, t)))
    shown = Math.max(shown, s.textEnd)
    t -= length
    s = next
  }
  return Math.min(sent, shown)
}

/**
 * How far the text is laid out while the reveal is at `target`: to the end of the sentence it is in, so a word being
 * revealed never jumps to the next line, and no further, so there is never a blank page of words still to come.
 */
export function laidOutTo(text: string, sentences: Iterable<TimedSentence>, target: number): number {
  if (target <= 0) return 0
  let end = target
  for (const s of sentences) if (s.textStart <= target && target < s.textEnd) end = Math.max(end, s.textEnd)
  return Math.min(text.length, Math.ceil(end))
}

/** A reply voice is speaking: how far its text is laid out, and where its reveal heads. */
export type SpokenReveal = { layout: number; target: number }

/** The reveal of the reply `reveal` speaks, or null when `turnId` is another reply's. */
export function spokenReveal(reveal: { turnId: string; head: Playhead | null; sentences: TimedSentence[] } | null, turnId: string | undefined, text: string, leadSecs: number): SpokenReveal | null {
  if (!reveal || !turnId || reveal.turnId !== turnId) return null
  const target = voiceTarget(text, reveal.sentences, reveal.head, leadSecs)
  return { layout: laidOutTo(text, reveal.sentences, target), target }
}
