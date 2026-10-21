/**
 * The agent's own voice, heard back by the microphone, is not the person. The browser's echo cancellation removes
 * most of it, not all: with laptop speakers enough gets through for the speech service to write it down. What it
 * writes is set apart here, word by word, from what the person says:
 *
 * - **Echo**: a word of the sentence the agent was saying when the word was heard, or of the one just before it
 *   (`TAIL_MS`), compared loosely (case, punctuation, a letter or two). Dropped. Only what was being said then
 *   counts: the person's common words ("no", "that's not what I meant") are not the agent's for having been in
 *   something it said earlier, or in a sentence not yet played.
 * - **Noise over the reply**: other words heard while the audio played, fewer than `CUT_IN_WORDS` in a row ("Plate
 *   is water." for "your plate is Walkthrough"; "in" for its "and"). Dropped too: cutting in takes words.
 * - **The person**: from the first word that is neither, everything after it, as the service wrote it.
 *
 * When each word was spoken comes from the service's word timings, traced back to when that audio was captured
 * (`streamClock`): the service can be seconds behind, so when a transcript arrives says little.
 */

import { alignToAgent, bareWord, type AgentWord } from './echoAlign'

export { bareWord, sameWord } from './echoAlign'

/** A word heard, with when it began and ended on the page's clock (null when the service gave no timing). */
export type HeardWord = { text: string; at: number | null; endAt?: number | null }

export type Sifted = {
  /** The person's words; empty when everything heard was the agent or noise. */
  text: string
  words: number
  /** Words set aside before the person's: the agent's, and others heard over its voice. */
  dropped: { echo: number; noise: number }
}

/** Words of the person's own, over the agent's voice, before they count as cutting in. */
export const CUT_IN_WORDS = 2
/** The agent's words still come back this long after its audio stops (room, echo canceller, timing error). */
export const TAIL_MS = 1_500
/** Slack around the audio, for the service's word timings, within which other words still count as over it. */
const OVERLAP_SLACK_MS = 300
/** A word with no timing is placed by when its transcript arrived, which may be this far behind the speech. */
const ARRIVAL_LAG_MS = 8_000
/** What the agent said, and when its audio was heard, is kept this long. */
const MEMORY_MS = 60_000
/** Ticks of audio this close together are one stretch of it. */
const JOIN_MS = 250

type Span = { start: number; end: number }
/** A sentence of the agent's, and when it was heard: from when it began to play until the next began or audio stopped. */
type Said = { words: string[]; from: number; to: number }

/** What the echo filter remembers: what the agent said and when, and when its audio was heard. */
export type EchoState = { said: readonly Said[]; spans: readonly Span[] }

export const NO_ECHO: EchoState = { said: [], spans: [] }

/** A sentence of the agent's begins to be heard at `at`. */
export function echoSaid(state: EchoState, text: string, at: number): EchoState {
  const said = state.said.filter(s => at - s.to <= MEMORY_MS).map(s => ({ ...s }))
  const last = said[said.length - 1]
  if (last) last.to = Math.min(last.to, at)
  said.push({ words: text.split(/\s+/).map(bareWord).filter(Boolean), from: at, to: at })
  return { ...state, said }
}

/** The agent's audio is being heard at `at`: the latest sentence is what is heard. */
export function echoAudible(state: EchoState, at: number): EchoState {
  const said = state.said.map(s => ({ ...s }))
  const current = said[said.length - 1]
  if (current && at >= current.from) current.to = Math.max(current.to, at)
  const spans = state.spans.map(s => ({ ...s }))
  const last = spans[spans.length - 1]
  if (last && at - last.end <= JOIN_MS) last.end = Math.max(last.end, at)
  else spans.push({ start: at, end: at })
  return { said, spans: spans.filter(s => at - s.end <= MEMORY_MS) }
}

export function echoSift(state: EchoState, transcript: string, words: HeardWord[] | undefined, arrivedAt: number): Sifted {
  /**
   * The agent's words in the order said, each heard back from just before its sentence began until `TAIL_MS` after
   * it, as the service's timings run late.
   */
  const agentWords: AgentWord[] = state.said.flatMap(s =>
    s.words.map(word => ({ word, from: s.from - OVERLAP_SLACK_MS, to: s.to + TAIL_MS + OVERLAP_SLACK_MS })))
  /** How the time `at` stands to the agent's audio: over it, just after it, or apart from it. */
  const placed = (at: number, lag: number): 'over' | 'tail' | 'apart' => {
    let tail = false
    for (const s of state.spans) {
      if (at < s.start - OVERLAP_SLACK_MS) continue
      if (at <= s.end + OVERLAP_SLACK_MS + lag) return 'over'
      if (at <= s.end + TAIL_MS + lag) tail = true
    }
    return tail ? 'tail' : 'apart'
  }

  const heard = (words?.length ? words : transcript.split(/\s+/).map(text => ({ text, at: null })))
    .filter(w => bareWord(w.text) !== '')
  if (heard.length === 0) return { text: '', words: 0, dropped: { echo: 0, noise: 0 } }
  const spans = heard.map(w => {
    const at = w.at ?? arrivedAt
    return { text: w.text, earliest: at - (w.at === null ? ARRIVAL_LAG_MS : 0), latest: at }
  })
  const owners = alignToAgent(spans, agentWords)
  const marks = spans.map((s, i) => {
    const where = placed(s.latest, s.latest - s.earliest)
    return { where, owner: where === 'apart' ? 'own' : owners[i]! }
  })
  // Over the reply, the person cuts in with words of their own in a row; a word the agent also said may start it.
  const runFrom = (i: number) => {
    let own = 0
    for (let k = i; k < marks.length && marks[k]!.owner !== 'agent'; k++) if (marks[k]!.owner === 'own') own++
    return own >= CUT_IN_WORDS && marks.slice(i, i + 2).some(m => m.owner === 'own')
  }
  const from = marks.findIndex((m, i) => m.where === 'apart' || (m.owner === 'own' && m.where === 'tail')
    || (m.owner !== 'agent' && m.where === 'over' && runFrom(i)))
  const before = from === -1 ? marks : marks.slice(0, from)
  const dropped = { echo: before.filter(m => m.owner !== 'own').length, noise: before.filter(m => m.owner === 'own').length }
  if (from === -1) return { text: '', words: 0, dropped }
  if (from === 0) return { text: transcript.trim(), words: heard.length, dropped }
  const rest = heard.slice(from)
  return { text: rest.map(w => w.text).join(' '), words: rest.length, dropped }
}

/** The same, holding its own state: for code that is not a component. */
export function createEchoGuard() {
  let state = NO_ECHO
  return {
    said(text: string, at: number) { state = echoSaid(state, text, at) },
    audible(at: number) { state = echoAudible(state, at) },
    sift: (transcript: string, words: HeardWord[] | undefined, arrivedAt: number): Sifted => echoSift(state, transcript, words, arrivedAt),
    reset() { state = NO_ECHO },
  }
}

export type EchoGuard = ReturnType<typeof createEchoGuard>
