import { describe, it, expect } from 'vitest'
import { hitsText, lastRecalledText, reliedOnShare } from '../memoryFormat'

const now = new Date('2026-10-17T12:00:00Z')

describe('memory text @SC-991', () => {
  it('says when an item was last recalled', () => {
    expect(lastRecalledText(null, now)).toBe('Never recalled')
    expect(lastRecalledText('2026-10-17T01:00:00Z', now)).toBe('Recalled today')
    expect(lastRecalledText('2026-10-16T01:00:00Z', now)).toBe('Recalled yesterday')
    expect(lastRecalledText('2026-10-07T12:00:00Z', now)).toBe('Recalled 10 days ago')
  })
  it('counts hits with the right plural', () => {
    expect(hitsText(1, 0)).toBe('Recalled 1 time, relied on 0 times')
    expect(hitsText(4, 2)).toBe('Recalled 4 times, relied on 2 times')
  })
  it('shows the share relied on among judged items, and none before any is judged', () => {
    expect(reliedOnShare({ used: 0, unused: 0 })).toBeNull()
    expect(reliedOnShare({ used: 3, unused: 1 })).toBe(75)
  })
})
