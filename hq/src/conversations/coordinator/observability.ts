/**
 * One log line per turn (conversation layer spec, Failure, recovery and observability): message to first
 * token, the turn's duration and how long its message waited, with the model and the tokens it used. The same
 * times are on the `InferenceTurn` row; this is the line to read in hq's log.
 */
import type { TurnUsage } from '../contract'
import type { TurnEnd } from './turnRecord'

export interface TurnTimings {
  turnId: string
  conversationId: string
  state: TurnEnd
  model: string | null
  usage: TurnUsage
  queuedAt: Date
  startedAt: Date
  firstTokenAt: Date | null
  endedAt: Date
}

const ms = (from: Date, to: Date) => Math.max(0, to.getTime() - from.getTime())

export function turnLogLine(t: TurnTimings): string {
  const firstToken = t.firstTokenAt ? `first token ${ms(t.queuedAt, t.firstTokenAt)} ms after the message` : 'no text'
  const tokens = `${t.usage.inputTokens} in, ${t.usage.outputTokens} out, ${t.usage.cacheReadTokens} cache read, ${t.usage.cacheWriteTokens} cache write`
  return `turn ${t.turnId} of conversation ${t.conversationId} ${t.state} on ${t.model ?? 'no model'}: ` +
    `${firstToken}, ran ${ms(t.startedAt, t.endedAt)} ms, queued ${ms(t.queuedAt, t.startedAt)} ms; ${tokens}`
}
