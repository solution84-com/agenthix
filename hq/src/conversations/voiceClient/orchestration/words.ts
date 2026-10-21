/**
 * The word tables barge-in and the hand-raise decide by (adaptive voice spec, Orchestration §2 and §4): what the
 * person said, read against the stop words, the acknowledgements and the invitations in the settings.
 *
 * Words are compared loosely: lower case, without punctuation, and with a letter repeated in a row read once, so
 * "Mm-hmm." matches "mm-hm" and "Okay!" matches "okay".
 */
import type { VoiceSettings } from '../settings'

/** What a stretch of the person's words says, for barge-in: `own` is enough words of their own to stop the reply. */
export type Said = 'stop' | 'own' | 'ack' | 'unclear' | 'none'

const loose = (word: string) => word.replace(/(.)\1+/g, '$1')

export function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/).map(w => w.replace(/^[-']+|[-']+$/g, '')).filter(Boolean).map(loose)
}

const phrases = (list: readonly string[]) => list.map(tokens).filter(p => p.length > 0)

function startsAt(words: readonly string[], at: number, phrase: readonly string[]): boolean {
  return phrase.every((w, i) => words[at + i] === w)
}

/** Whether any of `list` appears in `text` as whole words. */
export function mentions(text: string, list: readonly string[]): boolean {
  const words = tokens(text)
  const wanted = phrases(list)
  return words.some((_, at) => wanted.some(p => startsAt(words, at, p)))
}

/** Whether `text` is one of `list` and nothing else. */
export function isOnly(text: string, list: readonly string[]): boolean {
  const words = tokens(text)
  return words.length > 0 && phrases(list).some(p => p.length === words.length && startsAt(words, 0, p))
}

/** The words of `text` left when every acknowledgement is taken out, and whether there was one. */
function withoutAcknowledgements(words: readonly string[], acks: readonly (readonly string[])[]) {
  const rest: string[] = []
  let acknowledged = false
  for (let at = 0; at < words.length;) {
    const ack = acks.filter(p => startsAt(words, at, p)).sort((a, b) => b.length - a.length)[0]
    if (ack) { acknowledged = true; at += ack.length } else { rest.push(words[at]!); at++ }
  }
  return { rest, acknowledged }
}

/** The barge-in table: a stop word stops at once; enough of the person's own words stop; acknowledgements alone resume. */
export function said(text: string, settings: VoiceSettings['bargeIn']): Said {
  const words = tokens(text)
  if (words.length === 0) return 'none'
  if (mentions(text, settings.stopWords)) return 'stop'
  const { rest, acknowledged } = withoutAcknowledgements(words, phrases(settings.acknowledgements))
  if (rest.length >= settings.ownWordsToStop) return 'own'
  if (rest.length === 0) return acknowledged ? 'ack' : 'none'
  return 'unclear'
}

/** The person invites a raised hand in so many words: "go ahead", "what is it", "yes?". */
export function invites(text: string, invitations: readonly string[]): boolean {
  return isOnly(text, invitations)
}
