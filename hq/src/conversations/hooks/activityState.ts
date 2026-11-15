/**
 * The work bar's live lines and the cards' words, apart from React: what the live events change, and how a state
 * and a result read.
 */
import type {
  ConversationOperationLinesEvent,
  OperationStateValue,
} from '../../shared/conversations/protocol'
import { plainText } from '../plainText'

export type LiveLines = Record<string, { lines: string[]; endedHelpers: number }>

/** A lines event replaces what is held for its operation; an operation with none left is dropped. */
export function applyLines(held: LiveLines, e: ConversationOperationLinesEvent): LiveLines {
  if (e.lines.length === 0 && e.endedHelpers === 0) {
    const { [e.operationId]: _gone, ...rest } = held
    return rest
  }
  return { ...held, [e.operationId]: { lines: e.lines, endedHelpers: e.endedHelpers } }
}

const STATE_WORDS: Partial<Record<OperationStateValue, string>> = {
  WAITING_FOR_APPROVAL: 'waiting for approval',
  ACCEPTED: 'queued',
  QUEUED: 'queued',
  RUNNING: 'working',
  UNCERTAIN: 'working',
  COMPLETED: 'finished',
  FAILED: 'failed',
  CANCELLED: 'stopped',
  DETACHED: 'stopped',
}
export const stateWord = (state: OperationStateValue): string => STATE_WORDS[state] ?? ''

/** A result's one line as its card shows it: its first line of prose — past any heading — without its markdown. */
export function cardSummaryLine(text: string, max = 160): string {
  const lines = text.split('\n')
  const prose = lines.filter((l) => !/^\s{0,3}#{1,6}\s/.test(l))
  const first = (prose.some((l) => plainText(l)) ? prose : lines).map((l) => plainText(l)).find((l) => l !== '') ?? ''
  return oneLine(first, max)
}

/** A result's one line for the card: its first line, cut at a sentence's end when long. */
export function oneLine(text: string, max = 160): string {
  const first = text.split('\n').find((l) => l.trim())?.trim() ?? ''
  return first.length > max ? `${first.slice(0, max - 1)}…` : first
}
