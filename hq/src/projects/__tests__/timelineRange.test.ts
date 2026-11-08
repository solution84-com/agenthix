/** The timeline's range, what overlaps it and runs as slices (adr-0098). */
import { describe, it, expect } from 'vitest'
import { parseRunPageCursor, type RunRow } from '@agenthix/core'
import { timelineRange, knownRange, KNOWN_RANGE_PAD_DAYS, MAX_RANGE_DAYS, planOverlaps, inRange, runSlices, pageCursorAt } from '../timelineRange'

const day = (s: string) => new Date(`${s}T00:00:00.000Z`)
const R = { from: day('2026-10-01'), to: day('2026-11-01') }

describe('timelineRange @SC-564', () => {
  it('reads two dates', () => {
    expect(timelineRange('2026-10-01', '2026-11-01')).toEqual(R)
  })
  it('refuses an empty, inverted, unreadable or over-wide range', () => {
    expect(() => timelineRange('2026-10-01', '2026-10-01')).toThrow()
    expect(() => timelineRange('x', '2026-10-01')).toThrow()
    expect(() => timelineRange('2026-01-01', '2027-06-01')).toThrow()
  })
})

describe('planOverlaps @SC-564', () => {
  it('counts the finish day itself', () => {
    expect(planOverlaps(day('2026-09-20'), day('2026-10-01'), R)).toBe(true)
    expect(planOverlaps(day('2026-09-20'), day('2026-09-30'), R)).toBe(false)
  })
  it('takes either end alone as a one-day plan', () => {
    expect(planOverlaps(day('2026-10-15'), null, R)).toBe(true)
    expect(planOverlaps(null, day('2026-11-01'), R)).toBe(false)
    expect(planOverlaps(null, null, R)).toBe(false)
  })
})

describe('inRange @SC-564', () => {
  it('is inclusive at the start and exclusive at the end', () => {
    expect(inRange(day('2026-10-01'), R)).toBe(true)
    expect(inRange(day('2026-11-01'), R)).toBe(false)
    expect(inRange(null, R)).toBe(false)
  })
})

function run(over: Partial<RunRow>): RunRow {
  return {
    id: 'r', agentId: 'a', sessionId: 's', taskId: 't1', parentRunId: null, rootRunId: null, status: 'COMPLETED',
    inputText: '', outputText: null, thought: null, model: 'm', error: null, usage: null, diagnosticLog: null,
    manifestStatus: null, pendingManifest: null, approvedManifest: null, manifestDecidedById: null, manifestDecidedAt: null, contextUse: null,
    auditSummary: null,
    metadata: null, startedAt: '2026-10-05T10:00:00.000Z', endedAt: '2026-10-05T11:00:00.000Z', createdAt: '2026-10-05T09:59:00.000Z',
    agentPackageDigest: null, orgPackageDigest: null, platformPackageDigest: null,
    ...over,
  }
}

describe('runSlices @SC-565', () => {
  const now = new Date('2026-10-20T12:00:00Z')
  it('keeps the runs of the given tasks inside the range, as start and end', () => {
    const slices = runSlices([run({ id: 'r1' }), run({ id: 'r2', taskId: 'other' }), run({ id: 'r3', taskId: null })], new Set(['t1']), R, now)
    expect(slices).toEqual([{ runId: 'r1', taskId: 't1', status: 'COMPLETED', start: '2026-10-05T10:00:00.000Z', end: '2026-10-05T11:00:00.000Z' }])
  })
  it('keeps a run still going open-ended, and one that crosses the range start', () => {
    const slices = runSlices([
      run({ id: 'going', status: 'RUNNING', startedAt: '2026-10-20T11:00:00.000Z', endedAt: null }),
      run({ id: 'across', startedAt: '2026-09-30T23:00:00.000Z', endedAt: '2026-10-01T01:00:00.000Z' }),
      run({ id: 'before', startedAt: '2026-09-20T10:00:00.000Z', endedAt: '2026-09-20T11:00:00.000Z' }),
    ], new Set(['t1']), R, now)
    expect(slices.map(s => [s.runId, s.end])).toEqual([['going', null], ['across', '2026-10-01T01:00:00.000Z']])
  })
})

describe('pageCursorAt @SC-565', () => {
  it('is a cursor the site reads back as the range end', () => {
    expect(parseRunPageCursor(pageCursorAt(R.to))?.at).toBe('2026-11-01T00:00:00.000Z')
  })
})

describe('knownRange @SC-564', () => {
  const DAY = 24 * 60 * 60 * 1000
  const today = new Date('2026-10-08T15:30:00Z')

  it('runs from the earliest to the latest known date, today included, with room either side', () => {
    const r = knownRange([new Date('2026-09-20'), null, new Date('2026-11-05T10:00:00Z')], today)
    expect(r.capped).toBe(false)
    expect(r.from.toISOString()).toBe(new Date(Date.UTC(2026, 8, 20) - KNOWN_RANGE_PAD_DAYS * DAY).toISOString())
    expect(r.to.toISOString()).toBe(new Date(Date.UTC(2026, 10, 5) + DAY + KNOWN_RANGE_PAD_DAYS * DAY).toISOString())
  })

  it('with nothing known is a window around today', () => {
    const r = knownRange([], today)
    expect(r.from.getTime()).toBeLessThan(today.getTime())
    expect(r.to.getTime()).toBeGreaterThan(today.getTime())
    expect(r.capped).toBe(false)
  })

  it('cuts a longer span to a range around today and says so', () => {
    const r = knownRange([new Date('2024-01-01'), new Date('2028-01-01')], today)
    expect(r.capped).toBe(true)
    expect((r.to.getTime() - r.from.getTime()) / DAY).toBe(MAX_RANGE_DAYS)
    expect(r.from.getTime()).toBeLessThan(today.getTime())
    expect(r.to.getTime()).toBeGreaterThan(today.getTime())
  })
})
