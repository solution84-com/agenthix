import { describe, expect, it } from 'vitest'
import { applyLines, cardSummaryLine, oneLine, stateWord } from '../activityState'

describe('live lines @SC-1009', () => {
  it('replace what is held for the work and drop it when nothing is left', () => {
    let held = applyLines({}, { conversationId: 'c', operationId: 'o1', lines: ['Shop · a'], endedHelpers: 0 })
    expect(held.o1.lines).toEqual(['Shop · a'])
    held = applyLines(held, { conversationId: 'c', operationId: 'o1', lines: [], endedHelpers: 1 })
    expect(held.o1).toEqual({ lines: [], endedHelpers: 1 })
    expect(applyLines(held, { conversationId: 'c', operationId: 'o1', lines: [], endedHelpers: 0 })).toEqual({})
  })
})

describe('words @SC-1009', () => {
  it('say a state in plain words', () => {
    expect(stateWord('WAITING_FOR_APPROVAL')).toBe('waiting for approval')
    expect(stateWord('RUNNING')).toBe('working')
  })

  it('keep a result to its first line', () => {
    expect(oneLine('\n\nResizing takes 40ms\nmore')).toBe('Resizing takes 40ms')
    expect(oneLine('x'.repeat(300)).length).toBe(160)
    expect(cardSummaryLine('## Part 1\n\n**The personal space is empty.** More')).toBe('The personal space is empty. More')
    expect(cardSummaryLine('# Only a heading')).toBe('Only a heading')
    expect(cardSummaryLine('```\n**Empty.**')).toBe('Empty.')
  })
})
