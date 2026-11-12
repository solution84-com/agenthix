import { describe, it, expect } from 'vitest'
import { recalledTimesText, reliedOnShare, savedDayText, savedText } from '../memoryFormat'

describe('memory text @SC-2108', () => {
  it('shows the share relied on among judged items, and none before any is judged', () => {
    expect(reliedOnShare({ used: 0, unused: 0 })).toBeNull()
    expect(reliedOnShare({ used: 3, unused: 1 })).toBe(75)
  })
})

describe('when a memory was saved @SC-2108', () => {
  const at = new Date('2026-11-12T20:00:00')
  it('dates a row today by its time, and an older one by its day', () => {
    expect(savedDayText('2026-11-12T19:41:00', at)).toBe('today, 19:41')
    expect(savedDayText('2026-11-06T14:02:00', at)).toBe('6 Nov')
    expect(savedDayText('2025-11-06T14:02:00', at)).toBe('6 Nov 2025')
  })
  it('counts recalls, and says when there were none', () => {
    expect(recalledTimesText(0)).toBe('not recalled yet')
    expect(recalledTimesText(1)).toBe('recalled 1 time')
    expect(recalledTimesText(9)).toBe('recalled 9 times')
  })
  it('names who saved it and where, or an agent since deleted, and no place it cannot name', () => {
    const item = { savedBy: { id: 'a1', name: 'Kernel' }, savedIn: { type: 'project' as const, id: 'p1', name: 'Shop' }, createdAt: '2026-11-06T14:02:00', recallCount: 9 }
    expect(savedText(item, at)).toBe('Kernel saved this in Shop, 6 Nov, 14:02 · recalled 9 times')
    expect(savedText({ ...item, savedBy: null, savedIn: null, recallCount: 0 }, at)).toBe('An agent since deleted saved this, 6 Nov, 14:02 · not recalled yet')
  })
})
