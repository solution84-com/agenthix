import { describe, it, expect } from 'vitest'
import { turnLogLine, type TurnTimings } from '../observability'

const at = (s: number) => new Date(Date.UTC(2026, 10, 3, 10, 0, s))
const timings = (over: Partial<TurnTimings> = {}): TurnTimings => ({
  turnId: 't1', conversationId: 'c1', state: 'COMPLETED', model: 'm',
  usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
  queuedAt: at(0), startedAt: at(10), firstTokenAt: at(12), endedAt: at(20), ...over,
})

describe('the turn log line', () => {
  it('logs the wait of a message that joined a batch from when it arrived, as well as the first one\'s', () => {
    const line = turnLogLine(timings({ lastQueuedAt: at(8) }))
    expect(line).toContain('queued 10000 ms (2000 ms for the last message to join)')
  })

  it('logs one wait for a turn that took one message', () => {
    expect(turnLogLine(timings())).toMatch(/queued 10000 ms;/)
    expect(turnLogLine(timings({ lastQueuedAt: at(0) }))).not.toContain('to join')
  })
})
