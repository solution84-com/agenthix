import { describe, it, expect } from 'vitest'
import { DAY_MS, idleCutoff } from '../idle'

describe('when a conversation is idle @SC-974', () => {
  const now = new Date('2026-10-17T00:00:00.000Z')
  it('is the organisation\'s days back from now', () => {
    expect(idleCutoff(now, 90)!.getTime()).toBe(now.getTime() - 90 * DAY_MS)
    expect(idleCutoff(now, 30)!.getTime()).toBe(now.getTime() - 30 * DAY_MS)
  })
  it('archives nothing where the organisation sets no days', () => {
    expect(idleCutoff(now, 0)).toBeNull()
    expect(idleCutoff(now, Number.NaN)).toBeNull()
  })
})
