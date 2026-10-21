/**
 * What a reply started (walkthrough findings 31, 33 and 34): which calls start work, whether a step did nothing
 * else, how each piece it started or set for a time reads as a step, hq's own line for a step that started work
 * and wrote no words, and what the agent reads back of it next turn, so it never does it again. Pure.
 */
import type { ReplyStepView } from '../../shared/conversations/protocol'
import { USED_MEMORY } from '../memory/usedMemory'
import type { StepCall } from './replySteps'

/** The tools that start work: a call of one that was accepted, or waits for a person's okay, has its card. */
export const STARTS_WORK: ReadonlySet<string> = new Set(['start_work', 'run_task', 'create_task'])

/**
 * Whether every call of a step started work (walkthrough finding 31): one of the tools that start work, under way,
 * set for a time, or waiting for a person's okay. The reply ends there. A step that also read something — a lookup
 * detached past the wait limit, or one at Ask, included — or had a call refused goes on, so the next step can
 * answer it.
 */
export function onlyStartedWork(done: readonly StepCall[]): boolean {
  const counted = done.filter(d => d.call.name !== USED_MEMORY)
  return counted.length > 0 &&
    counted.every(d => STARTS_WORK.has(d.call.name) && (d.outcome.status === 'accepted' || d.outcome.status === 'waitingApproval'))
}

/** When a task set for a time starts, as the person reads it: "Sun 18 Oct, 9:00", in their timezone. */
export function startsAtWords(at: Date, timezone: string | null): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23', timeZone: timezone ?? 'UTC',
  }).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
  const when = `${part('weekday')} ${part('day')} ${part('month')}, ${Number(part('hour'))}:${part('minute')}`
  return timezone ? when : `${when} UTC`
}

const startsWhen = (d: StepCall, timezone: string | null) => (d.startsAt ? startsAtWords(d.startsAt, timezone) : 'at its time')

/** A step for one piece the reply made: the work started and where, or the task set and when it starts. */
export function madeLabel(d: StepCall, timezone: string | null): string {
  const title = d.title ?? 'work'
  if (d.made === 'set') return `Set "${title}" to start ${startsWhen(d, timezone)}`
  return `Started "${title}"${d.place ? ` · ${d.place}` : ''}`
}

const unique = (items: string[]) => [...new Set(items)]

/**
 * hq's line, in the agent's voice, for a step that only started work and wrote no words: "I've started: A; B.",
 * "I've set WAL-4 Morning check to start Sun 18 Oct, 9:00.", or both in one line. No model call.
 */
export function startedLine(done: readonly StepCall[], timezone: string | null): string {
  const started = unique(done.filter(d => d.made === 'started').map(d => d.title ?? 'the work'))
  const set = unique(done.filter(d => d.made === 'set').map(d => `${d.title ?? 'the task'} to start ${startsWhen(d, timezone)}`))
  const asked = unique(done.filter(d => STARTS_WORK.has(d.call.name) && d.outcome.status === 'waitingApproval').map(d => d.title ?? 'the work'))
  const parts = [
    ...(started.length ? [`started: ${started.join('; ')}`] : []),
    ...(set.length ? [`set ${set.join('; ')}`] : []),
    ...(asked.length ? [`asked for your okay to start: ${asked.join('; ')}`] : []),
  ]
  if (parts.length === 0) return "I've started the work."
  return `I've ${parts.join(', and ')}.`
}

/** What the agent reads back of what a reply started or set (finding 34): one line for each, or null for none. */
export function madeForLead(steps: readonly ReplyStepView[] | undefined): string | null {
  // hq's record, not the agent's voice: starting is something a call does, never something said (finding 38).
  const lines = (steps ?? []).filter(s => s.made).map(s => `[Record: ${s.label.charAt(0).toLowerCase()}${s.label.slice(1)}]`)
  return lines.length ? lines.join('\n') : null
}

// First-person ways of saying work is starting or has started. Conservative on purpose: a false match costs one
// more model call, a miss leaves the person told of work that does not exist (walkthrough finding 38).
const VERB = '(?:start(?:ed|ing)?|kick(?:ed|ing)? off|launch(?:ed|ing)?|begun|beginning|queu(?:ed|ing)|schedul(?:ed|ing)|running|set up|setting up)'
const CLAIMS: readonly RegExp[] = [
  new RegExp(`\\bI(?:['’]ve| have|['’]m| am)\\s+(?:now\\s+|just\\s+)?${VERB}\\b`, 'i'),
  /\bI(?:['’]ve| have)\s+(?:now\s+|just\s+)?set\b/i,
  /\bI(?:['’]ll| will)\s+(?:now\s+|just\s+)?(?:start|kick off|begin|launch|queue|schedule|set up)\b/i,
  /(?:^|[.!?]\s+|\n)(?:Starting|Kicking off|Launching|Beginning|Queuing|Scheduling|Setting up)\b/,
]

/** Whether words say the agent is starting, or has started, work. */
export function claimsStart(text: string): boolean {
  return CLAIMS.some(re => re.test(text))
}

/** What the model is told when its words said work started and no call of the reply started any. */
export const NO_START_CALL =
  '[You said you are starting work, but this reply made no call that starts it, so nothing has started. Make ' +
  'the call now (start_work, run_task or create_task), or say plainly, in one short line, that nothing was started.]'
