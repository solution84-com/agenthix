import { describe, expect, it } from 'vitest'
import { when } from '../backupWords'

// Local times, as the machine's clock reads them.
const at = (h: number, m: number) => new Date(2026, 10, 17, h, m).toISOString()

describe('when a backup was taken, in words', () => {
  it('a backup in the small hours, read the next morning, was last night', () => {
    expect(when(at(2, 0), new Date(2026, 10, 17, 9, 0))).toBe('02:00 last night')
  })

  it('a backup minutes ago, read while it is still night, is today, not last night', () => {
    expect(when(at(4, 15), new Date(2026, 10, 17, 4, 20))).toBe('today 04:15')
  })

  it('a backup in the day is today', () => {
    expect(when(at(15, 20), new Date(2026, 10, 17, 16, 0))).toBe('today 15:20')
  })
})
