/**
 * The Log's steps grouped into one card per turn, pure. Your words become YOU steps, one per stretch between two other
 * steps, from the words as they grew on the page. A turn starts with your words when none is open; it stays open
 * until it is answered (the heavy model's reply is here, or the light model closed it), so words you go on with after
 * a hand over, before the reply, stay in it. A typed message always starts one. Steps before any turn go apart.
 *
 * Each card's steps run in time order, timed from when you started speaking; its header has your message, how the turn
 * ended and when you stopped, first heard something, and had the answer. Each card is checked against `logRules.ts`.
 */
import { checkRules } from './logRules'
import { secs, type CardStep, type LogCard, type LogStep, type TurnEnd } from './logModel'

export type TurnInput = {
  /** Every step but your spoken words. */
  steps: readonly LogStep[]
  /** Your words as they grew; empty when they were sent. */
  words: readonly { at: number; text: string }[]
  /** When you began speaking. */
  speechStarts: readonly number[]
  /** Your messages as sent, for the cards' headers. */
  messages: readonly { at: number; text: string }[]
  /** When you stopped the reply by speaking over it. */
  stops?: readonly number[]
}

export type LogView = { cards: LogCard[]; loose: CardStep[] }

/** How long before your first words arrive the start of speech may be. */
const SPEECH_LEAD_MS = 3_000

const wordsOf = (text: string) => text.trim().split(/\s+/).filter(Boolean)
const norm = (word: string) => word.toLowerCase()

/** The words of `text` after what `base` already had. */
export function newWords(base: string, text: string): string {
  const b = wordsOf(base)
  const t = wordsOf(text)
  let i = 0
  while (i < b.length && i < t.length && norm(b[i]!) === norm(t[i]!)) i++
  return t.slice(i).join(' ')
}

/** Your words, cut into a stretch at each other step. */
export function stretches(words: TurnInput['words'], cuts: readonly number[]): LogStep[] {
  const out: LogStep[] = []
  let base = ''
  let pending: { at: number; until: number; text: string; base: string } | null = null
  let ci = 0
  const flush = () => {
    if (!pending) return
    const said = newWords(pending.base, pending.text)
    if (said) out.push({ id: `you-${pending.at}`, at: pending.at, until: pending.until, actor: 'YOU', tag: 'said', title: `“${said}”` })
    base = pending.text
    pending = null
  }
  for (const w of [...words].sort((a, b) => a.at - b.at)) {
    while (ci < cuts.length && cuts[ci]! < w.at) { flush(); ci++ }
    if (!w.text.trim()) { flush(); base = ''; continue }
    if (pending) Object.assign(pending, { text: w.text, until: w.at })
    else pending = { at: w.at, until: w.at, text: w.text, base }
  }
  flush()
  return out
}

/** The words that stopped a reply: the first stretch still coming in when it stopped, or arriving soon after. */
function markStops(said: LogStep[], stops: readonly number[]): LogStep[] {
  const marked = new Set<LogStep>()
  for (const stop of stops) {
    const s = said.find(w => !marked.has(w) && (w.until ?? w.at) >= stop && w.at <= stop + SPEECH_LEAD_MS)
    if (s) marked.add(s)
  }
  return said.map(s => (marked.has(s) ? { ...s, tag: 'stopped the reply' } : s))
}

/** At the same moment: your words first, then SOUND, then what they caused (a check asked as SOUND said finished). */
const RANK: Partial<Record<LogStep['actor'], number>> = { YOU: 0, SOUND: 1 }
const rank = (s: LogStep) => RANK[s.actor] ?? 2

const OUTCOME: Record<TurnEnd, string> = {
  handedOver: 'Handed to the heavy model', closed: 'Closed by the light model', fallback: 'Fallback: the system handed over',
  bound: 'Kept open to the limit: the system handed over', limit: 'Closed at the 60 s limit', off: 'No light model: handed over as plain voice',
}

const END_WORDS: Record<TurnEnd, string> = {
  handedOver: 'the hand-over', closed: 'the close', fallback: 'the hand-over', bound: 'the hand-over', limit: 'the close', off: 'the hand-over',
}

function resolve(steps: readonly LogStep[], zero: number, byId: ReadonlyMap<string, LogStep>): CardStep[] {
  return steps.map((s, i) => {
    const before = steps.slice(0, i)
    const extra: string[] = []
    if (s.from) {
      const from = s.from === 'system' ? before.findLast(b => b.actor === 'SYSTEM' && b.ends) : byId.get(s.from)
      if (from) extra.push(`from ${s.from === 'system' ? `the ${from.tag}` : s.fromWords ?? 'the check'} at ${secs(from.at - zero)}`)
    }
    if (s.sinceEnd) {
      const end = before.findLast(b => b.ends)
      if (end && s.answers) extra.push(`first words ${secs(s.at - end.at)} after ${END_WORDS[end.ends!]}`)
    }
    const detail = [...extra, s.detail].filter(Boolean).join(' · ')
    return { ...s, rel: s.at - zero, ...(detail && { detail }) }
  })
}

function header(steps: readonly CardStep[], zero: number): Pick<LogCard, 'outcome' | 'timings'> {
  const endAt = steps.findIndex(s => s.ends)
  const end = endAt < 0 ? undefined : steps[endAt]
  const replies = steps.filter(s => s.actor === 'HEAVY' && s.tag === 'reply')
  let outcome = end ? OUTCOME[end.ends!]
    : steps.some(s => s.notYet) ? 'Not yet: kept open'
    : replies.some(r => r.answers) ? (steps.some(s => s.typed) ? 'Typed: answered by the heavy model' : 'Plain voice: answered by the heavy model')
    : 'Under way'
  if (end && steps.slice(endAt + 1).some(s => s.actor === 'YOU')) outcome += ' · you went on after it'
  if (replies.some(r => r.withdrawn)) outcome += ' · the reply was replaced'

  const upTo = end ? steps.slice(0, endAt + 1) : steps
  const sound = upTo.findLast(s => s.actor === 'SOUND')
  const you = upTo.findLast(s => s.actor === 'YOU')
  const said = sound ? sound.stoppedAt ?? sound.at : you ? (you.until ?? you.at) : null
  // You cannot stop before you started: the card starts when you spoke (`startWhenSpoken`).
  const stop = said === null ? null : Math.max(said, zero)
  if (stop === null) return { outcome, timings: [] }
  const timings = [`you stopped at ${secs(stop - zero)}`]
  const heard = steps.find(s => s.heard && s.at >= stop)
  if (heard) timings.push(`first sound ${secs(heard.at - stop)} after you stopped`)
  const answer = replies.find(r => r.heard && r.at >= stop)
  if (answer) timings.push(`answer ${secs(answer.at - stop)} after you stopped`)
  else if (end?.ends === 'closed' || end?.ends === 'limit') timings.push('no heavy model call')
  return { outcome, timings }
}

type Group = { zero: number; after: number; steps: LogStep[] }

/**
 * The card's 0.0 s when your words reached the page late: SOUND heard you stop before they arrived, so they were said
 * earlier than any start of speech close before them. The start is then the last one before you stopped, after the card
 * before; the card's first words are placed there. Every time in the card is on the page's clock, so the pauses the
 * checks were asked after (from when the sound went quiet) and when you stopped then agree.
 */
function startWhenSpoken(g: Group, speechStarts: readonly number[]): void {
  const stopped = g.steps.find(s => s.actor === 'SOUND' && s.stoppedAt !== undefined)?.stoppedAt
  if (stopped === undefined || stopped >= g.zero) return
  const start = speechStarts.findLast(m => m <= stopped && m > g.after)
  const zero = start ?? stopped
  const first = g.steps[0]
  if (first?.actor === 'YOU' && first.at === g.zero) g.steps[0] = { ...first, at: zero }
  g.zero = zero
}

export function logTurns({ steps, words, speechStarts, messages, stops = [] }: TurnInput): LogView {
  // A near miss and a hum service answer are folded away, and a PACE note is an aside: they cut no stretch of your words, or folding them would
  // leave them in pieces.
  const cuts = steps.filter(s => !s.nearMiss && !s.service && !s.aside).map(s => s.at).sort((a, b) => a - b)
  const all = [...markStops(stretches(words, cuts), stops), ...steps].sort((a, b) => a.at - b.at || rank(a) - rank(b))
  const groups: Group[] = []
  const loose: LogStep[] = []
  let current = null as Group | null
  let answered = false
  for (const s of all) {
    let step = s
    if (s.actor === 'YOU' && (!current || answered || s.typed)) {
      const after = current?.steps.at(-1)?.at ?? Number.NEGATIVE_INFINITY
      const start = s.typed ? undefined : speechStarts.findLast(m => m <= s.at && m > after && s.at - m <= SPEECH_LEAD_MS)
      current = { zero: start ?? s.at, after, steps: [] }
      groups.push(current)
      answered = false
      step = { ...s, at: current.zero }
    }
    if (!current) { loose.push(step); continue }
    current.steps.push(step)
    if (step.answers || step.ends === 'closed' || step.ends === 'limit') answered = true
  }

  groups.forEach(g => startWhenSpoken(g, speechStarts))
  const byId = new Map(all.map(s => [s.id, s]))
  const cards = groups.map((g, i): LogCard => {
    const next = groups[i + 1]?.zero ?? Number.POSITIVE_INFINITY
    const cardSteps = checkRules(resolve(g.steps, g.zero, byId))
    const sent = messages.filter(m => m.at >= g.zero && m.at < next).at(-1)?.text
    const message = sent ?? cardSteps.filter(s => s.actor === 'YOU').map(s => s.title.replace(/^“|”$/g, '')).join(' ')
    return { id: `turn-${g.zero}`, zero: g.zero, steps: cardSteps, message, reasonOn: cardSteps.some(s => s.reasonOn), ...header(cardSteps, g.zero) }
  })
  const first = loose[0]?.at ?? 0
  return { cards: cards.reverse(), loose: resolve(loose, first, byId) }
}
