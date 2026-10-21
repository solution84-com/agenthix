import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../../../agents/dispatchService', () => ({}))
vi.mock('../../../../sessions/siteRuntimeStore', () => ({}))
vi.mock('../standingWorker', () => ({}))

import { decide, pastHighMark } from '../freshStart'

const use = (tokens: number, window = 200_000) => ({ tokens, summarisesAt: null, window, at: '2026-10-17T10:00:00.000Z' })

describe('pastHighMark @SC-960', () => {
  it('is reached at 70% of the window, and never without a figure or a window', () => {
    expect(pastHighMark(use(139_999))).toBe(false)
    expect(pastHighMark(use(140_000))).toBe(true)
    expect(pastHighMark(null)).toBe(false)
    expect(pastHighMark(use(10, 0))).toBe(false)
  })
})

describe('decide, for a brief just taken on a free worker @SC-960', () => {
  it('starts a worker past the high mark fresh', () => {
    expect(decide({ isCurrent: true, closed: false, use: use(150_000) })).toBe('fresh')
  })

  it('keeps a worker below the mark, or whose figure is not known', () => {
    expect(decide({ isCurrent: true, closed: false, use: use(20_000) })).toBe('stay')
    expect(decide({ isCurrent: true, closed: false, use: null })).toBe('stay')
  })

  it('starts a worker fresh when the brief needs another runtime, as a session keeps the runtime it began on @SC-955', () => {
    expect(decide({ isCurrent: true, closed: false, otherRuntime: true, use: use(20_000) })).toBe('fresh')
    expect(decide({ isCurrent: true, closed: true, otherRuntime: true, use: null })).toBe('stay')
  })

  it('keeps a closed worker, so the brief fails with why', () => {
    expect(decide({ isCurrent: true, closed: true, use: use(190_000) })).toBe('stay')
  })

  it('starts a worker whose harness state is gone fresh, as it is not closed for good', () => {
    expect(decide({ isCurrent: true, closed: false, lost: true, use: null })).toBe('fresh')
    expect(decide({ isCurrent: false, closed: false, lost: true, use: null })).toBe('move')
  })

  it('moves a brief that reached a worker already started fresh from', () => {
    expect(decide({ isCurrent: false, closed: false, use: null })).toBe('move')
  })
})
