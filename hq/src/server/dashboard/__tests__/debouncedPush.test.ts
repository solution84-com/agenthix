import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { triggerSnapshotPush, __resetForTests } from '../debouncedPush'

type Emitted = { room: string; event: string }

describe('debouncedPush', () => {
  let emitted: Emitted[]

  beforeEach(() => {
    vi.useFakeTimers()
    emitted = []
    const rooms = new Map<string, Set<string>>([['person:u1', new Set(['s1'])], ['person:u2', new Set(['s2'])], ['task:t1', new Set(['s1'])]])
    ;(globalThis as { __wasp_io__?: unknown }).__wasp_io__ = {
      sockets: { adapter: { rooms } },
      to: (room: string) => ({ emit: (event: string) => { emitted.push({ room, event }) } }),
    }
    __resetForTests()
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as { __wasp_io__?: unknown }).__wasp_io__
  })

  it('tells each connected person once that what needs them changed, however many changes asked', async () => {
    triggerSnapshotPush()
    triggerSnapshotPush()
    triggerSnapshotPush()
    expect(emitted).toEqual([])
    await vi.advanceTimersByTimeAsync(600)
    expect(emitted).toEqual([
      { room: 'person:u1', event: 'needsYou:changed' },
      { room: 'person:u2', event: 'needsYou:changed' },
    ])
  })

  it('sends no dashboard snapshot to anyone', async () => {
    triggerSnapshotPush()
    await vi.advanceTimersByTimeAsync(600)
    expect(emitted.some((e) => e.event === 'dashboard:snapshot')).toBe(false)
  })
})
