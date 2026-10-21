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

  const timed = current.words.map((w, i) => ({ w, at: current.wordStartSecs[i] ?? Infinity })).filter(t => isWord(t.w))
  const spoken = timed.filter(t => t.at <= head.elapsed).length
  if (timed.length === 0 || spoken === 0) return Math.min(Math.max(chars, current.textStart), text.length)
  const pieces = [...text.slice(current.textStart, current.textEnd).matchAll(/\S+/g)].length
  const upto = Math.floor((spoken / timed.length) * pieces)
  const end = endOfPiece(text, current.textStart, current.textEnd, upto)
  return Math.min(Math.max(chars, end), text.length)
}
