import { describe, expect, it } from 'vitest'
import { formatLocalDay, formatTime } from '../layout'

describe('the day and the time of a start time are read in the same time zone', () => {
  it('names the viewer\'s own day, the one its time belongs to', () => {
    const at = new Date(2026, 10, 10, 3, 50) // 10 Nov, 03:50 on the viewer's clock, whatever its zone
    expect(formatLocalDay(at)).toBe('Tue 10 Nov')
    expect(formatTime(at)).toMatch(/03:50|3:50/)
  })
})
