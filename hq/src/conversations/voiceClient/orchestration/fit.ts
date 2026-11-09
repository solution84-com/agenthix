/**
 * Which listening sound fits the person's last words (voice that stays in the conversation, spec §3 "Fit"): a cheap
 * local check, no model call. Letting the model choose the sound was tried and added nothing: it chose a hum 22
 * times of 23 and never an acknowledging word.
 *
 * - A **question** or a **request** gets a hum: "I see." after "can you move it" sounds like an answer.
 * - A **telling** (the person is telling or explaining) gets a hum or an acknowledging word.
 * - **Mid-clause**: the last word cannot end a clause ("on the", "and", "because", "um"). People make listening
 *   sounds at a clause's end, not inside one, so nothing plays, until the longest wait has passed: then a hum.
 * - **Too little** heard to tell: nothing.
 */
import type { ListeningTier } from './listeningTiers'
import { mentions, tokens } from './words'

export type Fit = 'question' | 'request' | 'telling' | 'mid-clause' | 'too-little'

const set = (words: string[]) => new Set(words.map(w => tokens(w)[0]!))

/** Words a clause cannot end on: articles, conjunctions, prepositions, possessives, auxiliaries and filled pauses. */
const CLAUSE_OPEN = set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'so', 'because', 'cause', 'since', 'if', 'when', 'while', 'than',
  'that', 'which', 'who', 'whose', 'whom', 'where', 'whether', 'although', 'though', 'unless', 'until', 'as',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'into', 'onto', 'about', 'by', 'over', 'under', 'between',
  'through', 'after', 'before', 'like', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'this', 'these', 'those',
  'some', 'any', 'every', 'each', 'is', 'are', 'was', 'were', 'be', 'been', 'am', 'will', 'would', 'could',
  'should', 'can', 'might', 'must', 'shall', 'do', 'does', 'did', 'have', 'has', 'had', 'not', 'very', 'really',
  'um', 'umm', 'uh', 'er', 'erm', 'ah',
])
/** Words that open a clause without changing what it is: "so", "okay", "and then". */
const LEAD_IN = set(['so', 'and', 'but', 'okay', 'ok', 'well', 'um', 'uh', 'oh', 'right', 'then', 'also', 'now', 'anyway'])
const QUESTION_START = set([
  'what', 'why', 'how', 'when', 'where', 'who', 'whom', 'whose', 'which', 'is', 'are', 'was', 'were', 'am', 'do',
  'does', 'did', 'can', 'could', 'would', 'will', 'should', 'shall', 'may', 'might', 'have', 'has', 'had', "isn't",
  "aren't", "don't", "doesn't", "didn't", "can't", "won't", "wouldn't", "couldn't", "shouldn't",
])
const REQUEST_PHRASES = [
  'can you', 'could you', 'would you', 'will you', 'please', 'i need you to', 'i want you to', "i'd like you to",
  'i would like you to', 'remind me', "let's", 'let us', 'help me',
]
/** Verbs that, opening a sentence, make it a request. */
const COMMANDS = set([
  'add', 'book', 'cancel', 'change', 'check', 'create', 'delete', 'draft', 'email', 'find', 'give', 'look', 'make',
  'move', 'open', 'put', 'remove', 'schedule', 'send', 'set', 'show', 'tell', 'update', 'write', 'call', 'reply',
  'summarise', 'summarize', 'list', 'ask', 'start', 'stop', 'run', 'fix',
])

const withoutLeadIn = (words: string[]) => {
  let at = 0
  while (at < words.length - 1 && LEAD_IN.has(words[at]!)) at++
  return words.slice(at)
}

/** The last stretch of `text` cut at any of `marks`, as words. */
const lastPart = (text: string, marks: RegExp) => {
  const parts = text.split(marks).map(p => tokens(p)).filter(p => p.length > 0)
  return withoutLeadIn(parts.at(-1) ?? [])
}

export function fitOf(text: string): Fit {
  const words = tokens(text)
  if (words.length < 2) return 'too-little'
  if (CLAUSE_OPEN.has(words.at(-1)!)) return 'mid-clause'
  const sentence = lastPart(text, /[.?!]+/)
  if (mentions(sentence.join(' '), REQUEST_PHRASES) || COMMANDS.has(sentence[0]!)) return 'request'
  if (/\?\s*$/.test(text) || QUESTION_START.has(lastPart(text, /[.?!,;:]+/)[0]!)) return 'question'
  return 'telling'
}

/** The tiers a sound may be drawn from for `fit`; `waitedLong`: the longest wait has passed since the last. */
export function tiersFor(fit: Fit, waitedLong: boolean): ListeningTier[] {
  switch (fit) {
    case 'telling': return ['hum', 'acknowledge']
    case 'question':
    case 'request': return ['hum']
    case 'mid-clause': return waitedLong ? ['hum'] : []
    default: return []
  }
}
