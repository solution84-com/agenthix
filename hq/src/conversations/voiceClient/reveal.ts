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

/**
 * Under the light model a reply's message starts with the lines the person already heard, then a blank line, then the
 * reply (`prefix\n\nreply`), while the sentences place their words in the reply alone. Where the reply starts in `text`:
 * 0 when `text` does not start with `prefix` (not stored yet, or rewritten), so the reveal falls back to the plain one.
 */
export function replyStart(text: string, prefix: string | undefined): number {
  if (!prefix || !text.startsWith(prefix)) return 0
  return prefix.length + (text.startsWith('\n\n', prefix.length) ? 2 : 0)
}

/** The sentences moved to where their words sit in a text whose reply starts at `offset`. */
function placedAt<S extends TimedSentence>(sentences: Iterable<S>, offset: number): S[] {
  return [...sentences].map(s => ({ ...s, textStart: s.textStart + offset, textEnd: s.textEnd + offset }))
}

/**
 * Under the light model, the lines heard at the head of the reply awaited, before hq says what heads its message (`heardPrefix`):
 * those that began to play since a reply last took them, joined as hq joins them. `turnId` is null while the person's
 * turn is still open and no turn has them yet: they are drawn as the agent's bubble of their own (`openLinesOf`).
 * `wordsBefore`: how many of the words being said came before the first line, so the bubble stands after them; null
 * when it stands after all of them.
 */
export type Heading = { turnId: string | null; heard: string; wordsBefore?: number | null }

/** Where voice holds a reply back: what the bubble of `turnId` draws comes from these. */
type Voiced = { reveal: { turnId: string; head: Playhead | null; sentences: TimedSentence[]; heardPrefix?: string } | null; heading?: Heading | null }

/**
 * The head of a reply's bubble, and how much of it shows: hq's prefix once known, of which a line not yet begun stays
 * hidden; before that, the lines heard so far. Null when no line heads it.
 */
function headOf(voice: Voiced, turnId: string): { head: string; shows: number } | null {
  const prefix = voice.reveal?.turnId === turnId ? voice.reveal.heardPrefix : undefined
  const heard = voice.heading?.turnId === turnId ? voice.heading.heard : ''
  if (prefix) return { head: prefix, shows: heard && prefix.startsWith(heard) ? heard.length : prefix.length }
  return heard ? { head: heard, shows: heard.length } : null
}

/**
 * How much of a bubble's text was already on screen before this bubble drew it: the head of the turn the lines heard are
 * bound to, shown first in the bubble of their own while the turn was open. Its reveal starts there, so they never fade
 * in again where the bubble becomes the turn's message.
 */
export function headShown(voice: Voiced, turnId: string | undefined, text: string): number {
  const h = turnId ? headOf(voice, turnId) : null
  return h && text.startsWith(h.head.slice(0, h.shows)) ? h.shows : 0
}

/** The lines said while the person's turn is open, with the words being said before and after the first of them. */
export type OpenLines = { lines: string; before: string; after: string }

/**
 * The lines heard that no bubble of a turn draws yet, as the agent's bubble of their own: the person's turn is still
 * open, or the turn they head is not on screen yet. `said`: the person's words being said, split where the first line
 * began; `drawn`: whether a turn's agent bubble is on screen.
 */
export function openLinesOf(heading: Heading | null | undefined, drawn: (turnId: string) => boolean, said: string | null | undefined): OpenLines | null {
  if (!heading?.heard.trim() || (heading.turnId !== null && drawn(heading.turnId))) return null
  const words = said?.trim() ? said.trim().split(/\s+/) : []
  const n = Math.min(heading.wordsBefore ?? words.length, words.length)
  return { lines: heading.heard, before: words.slice(0, n).join(' '), after: words.slice(n).join(' ') }
}

/**
 * The text a reply's bubble draws while voice is on: the lines heard first, as hq will store them (`prefix\n\nreply`),
 * when its text does not hold them yet — the bubble before any text, and the reply as it streams.
 */
export function replyTextOf(voice: Voiced, turnId: string | undefined, text: string): string {
  const h = turnId ? headOf(voice, turnId) : null
  if (!h || text.startsWith(h.head)) return text
  return text.trim() ? `${h.head}\n\n${text}` : h.head
}

/**
 * How much of a reply's bubble (`text`, from `replyTextOf`) shows: the lines heard as they begin, then the reply's words
 * as they are heard; null for all of it, when voice holds nothing of it back.
 */
export function revealedReply(voice: Voiced, turnId: string | undefined, text: string): number | null {
  if (!turnId) return null
  const reveal = voice.reveal?.turnId === turnId ? voice.reveal : null
  const h = headOf(voice, turnId)
  const offset = h ? replyStart(text, h.head) : 0
  if (!reveal) return h && offset > 0 ? h.shows : null
  if (offset === 0) return revealedChars(text, reveal.sentences, reveal.head)
  return Math.max(h!.shows, revealedChars(text, placedAt(reveal.sentences, offset), reveal.head))
}

/** What was heard of a reply, when lines heard come first: those show whole from the start, the reply keeps pace. */
export function revealedCharsAfter(text: string, sentences: Iterable<TimedSentence>, head: Playhead | null, prefix: string | undefined): number {
  const offset = replyStart(text, prefix)
  if (offset === 0) return revealedChars(text, sentences, head)
  return Math.max(prefix!.length, revealedChars(text, placedAt(sentences, offset), head))
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
export function spokenReveal(reveal: Voiced['reveal'], turnId: string | undefined, text: string, leadSecs: number, heading?: Heading | null): SpokenReveal | null {
  if (!turnId) return null
  const voice = { reveal, heading }
  const held = reveal?.turnId === turnId ? reveal : null
  const h = headOf(voice, turnId)
  const offset = h ? replyStart(text, h.head) : 0
  if (!held) return h && offset > 0 ? { layout: h.shows, target: h.shows } : null
  const sentences = offset === 0 ? held.sentences : placedAt(held.sentences, offset)
  const target = Math.max(offset === 0 ? 0 : h!.shows, voiceTarget(text, sentences, held.head, leadSecs))
  return { layout: laidOutTo(text, sentences, target), target }
}
