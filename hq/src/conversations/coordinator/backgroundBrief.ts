/**
 * The brief hq writes when it moves the rest of a long reply to the background itself (walkthrough findings 28 and
 * 30): what the person asked, word for word, then what the reply already looked up, started or changed, so the
 * work neither repeats it nor needs the conversation; and the one place it may work in. Pure.
 */
import { isReadTool } from '../../server/controlplane/turnCaller'
import { USED_MEMORY } from '../memory/usedMemory'
import type { StepCall } from './replySteps'

/** The place the work runs in: what start_work is passed, and the brief's words for it. */
export interface BriefPlace { key: string; words: string }

export const TITLE_MAX = 80
const ASKED_MAX = 16_000
const INPUT_MAX = 300
const RESULT_MAX = 1_500
const FOUND_MAX = 12_000

function capped(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function compact(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? {})
  return capped(text.replace(/\s+/g, ' ').trim(), max)
}

/** The work's title: the person's first line, as they wrote it. Null when there are no words to name it by. */
export function backgroundTitle(asked: readonly string[]): string | null {
  const first = asked.map(a => a.trim()).find(a => a.length > 0)
  if (!first) return null
  return capped(first.split('\n')[0]!.replace(/\s+/g, ' ').trim(), TITLE_MAX)
}

type Kind = 'found' | 'changed' | 'refused'

function kindOf({ call, outcome }: StepCall): Kind {
  if (outcome.status === 'refused') return 'refused'
  if (outcome.status === 'done' && isReadTool(call.name)) return 'found'
  return 'changed'
}

function lineOf({ call, outcome, title }: StepCall): string {
  const asked = `${call.name} ${compact(call.input, INPUT_MAX)}`
  switch (outcome.status) {
    case 'done': return `- ${asked} → ${compact(outcome.result, RESULT_MAX)}`
    case 'accepted': return `- ${asked} → started${title ? ` ("${title}")` : ''}, still going`
    case 'waitingApproval': return `- ${asked} → waiting for the person's okay`
    case 'refused': return `- ${asked} → refused: ${compact(outcome.reason, RESULT_MAX)}`
  }
}

/** Lines up to the cap; what does not fit is counted, not cut mid-line. */
function within(lines: string[], budget: { left: number }): string[] {
  const kept: string[] = []
  for (const line of lines) {
    if (line.length + 1 > budget.left) {
      kept.push(`- (and ${lines.length - kept.length} more, left out for length)`)
      break
    }
    kept.push(line)
    budget.left -= line.length + 1
  }
  return kept
}

export function backgroundBrief(input: { asked: readonly string[]; found: readonly StepCall[]; place: BriefPlace }): string {
  const asked = capped(input.asked.map(a => a.trim()).filter(Boolean).join('\n\n'), ASKED_MAX)
  const calls = input.found.filter(s => s.call.name !== USED_MEMORY)
  const budget = { left: FOUND_MAX }
  const section = (kind: Kind, heading: string): string[] => {
    const lines = calls.filter(s => kindOf(s) === kind).map(lineOf)
    return lines.length > 0 ? ['', heading, ...within(lines, budget)] : []
  }
  return [
    'What they asked, word for word:',
    '',
    asked,
    '',
    '---',
    'You began this as a reply in the conversation, and it was taking longer than a reply should, so you are',
    `carrying it on here. Work only in ${input.place.words}. If what they asked needs another place you cannot`,
    'reach from here, say so in your result rather than doing it.',
    ...section('changed', 'What you already started or changed in that reply. It stands: do not do it again.'),
    ...section('found', 'What you already looked up in that reply. Use it rather than looking it up again.'),
    ...section('refused', 'What was refused in that reply, and why.'),
  ].join('\n')
}
