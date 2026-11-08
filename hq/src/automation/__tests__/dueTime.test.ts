import { describe, it, expect } from 'vitest'
import { dueBy } from '../dueTime'

describe('a tick counts what falls due within its own minute', () => {
  const due = (iso: string, tick: string) => new Date(iso) <= dueBy(new Date(tick))

  it('a start time due at 2:40:00.001 fires on the 2:40:00.000 tick, not the 2:41 one', () => {
    expect(due('2026-10-03T02:40:00.001Z', '2026-10-03T02:40:00.000Z')).toBe(true)
  })

  it('so does one due late in the same minute, and the tick landing a few milliseconds late', () => {
    expect(due('2026-10-03T02:40:59.000Z', '2026-10-03T02:40:00.004Z')).toBe(true)
  })

  it('a timer firing a moment early still counts as its own minute', () => {
    expect(due('2026-10-03T02:40:00.000Z', '2026-10-03T02:39:59.999Z')).toBe(true)
  })

  it('nothing due in the next minute fires early', () => {
    expect(due('2026-10-03T02:41:00.000Z', '2026-10-03T02:40:00.000Z')).toBe(false)
  })
})
