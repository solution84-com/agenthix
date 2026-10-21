import { describe, it, expect } from 'vitest'
import {
  DAY_MS, PX_PER_DAY, chartView, dayAtScroll, daysMoved, dragPlan, moveStartTime, percentAt, planBox, scrollToDay, sliceBox, todayUtc, trackPx, viewOver,
} from '@agenthix/ui/timeline'
import { NOW } from './fixtures'

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
const today = todayUtc(NOW)

describe('the scales @SC-566', () => {
  it('Week is a column a day', () => {
    const v = viewOver('week', day('2026-09-28'), day('2026-10-19'))
    expect(v.from).toBe(day('2026-09-28'))
    expect(v.columns).toHaveLength(21)
    expect(v.to - v.from).toBe(21 * DAY_MS)
    expect(v.columns[0]!.label).toBe('Mon 28')
    expect(v.columns[5]!.weekend).toBe(true)
  })

  it('Month is a column a week, from a Monday, out to whole weeks', () => {
    const v = viewOver('month', day('2026-09-02'), day('2026-12-01'))
    expect(new Date(v.from).getUTCDay()).toBe(1)
    expect(v.from).toBeLessThanOrEqual(day('2026-09-02'))
    expect(v.to).toBeGreaterThanOrEqual(day('2026-12-01'))
    expect(v.columns.every(c => c.end - c.start === 7 * DAY_MS)).toBe(true)
  })

  it('Quarter is a column a month, out to whole months, headed by year', () => {
    const v = viewOver('quarter', day('2026-07-15'), day('2027-06-02'))
    expect(v.from).toBe(day('2026-07-01'))
    expect(v.to).toBe(day('2027-07-01'))
    expect(v.columns.map(c => c.label).slice(0, 3)).toEqual(['Jul', 'Aug', 'Sep'])
    expect(v.columns).toHaveLength(12)
    expect(v.groups.map(g => g.label)).toEqual(['2026', '2027'])
  })
})

describe('the range the chart scrolls across @SC-566', () => {
  const known = { from: day('2026-08-01'), to: day('2026-12-15') }

  it('covers everything known', () => {
    for (const scale of ['week', 'month', 'quarter'] as const) {
      const v = chartView(scale, known, today, 1200)
      expect(v.from).toBeLessThanOrEqual(known.from)
      expect(v.to).toBeGreaterThanOrEqual(known.to)
    }
  })

  it('always leaves room to scroll either side of today, even with nothing known', () => {
    const v = chartView('week', null, today, 1200)
    const viewportDays = (1200 - 176) / PX_PER_DAY.week
    expect(v.to - today).toBeGreaterThanOrEqual(viewportDays * DAY_MS)
    expect(today - v.from).toBeGreaterThan(0)
  })

  it('is as wide as its days at the scale', () => {
    const v = chartView('week', known, today, 1200)
    expect(trackPx(v)).toBe(((v.to - v.from) / DAY_MS) * PX_PER_DAY.week)
  })

  it('opens with today a quarter of the way along, and reads the day at the left edge back from a scroll', () => {
    const v = chartView('week', known, today, 1200)
    const left = scrollToDay(v, today, 1200)
    expect(dayAtScroll(v, left)).toBe(today - Math.round((0.25 * (1200 - 176)) / PX_PER_DAY.week) * DAY_MS)
    expect(scrollToDay(v, v.from, 1200)).toBe(0)
  })
})

describe('bars @SC-566', () => {
  const v = viewOver('week', day('2026-09-28'), day('2026-10-19'))

  it('draws a plan from its first day to the end of its last', () => {
    const box = planBox(v, '2026-10-05', '2026-10-06')!
    expect(box.left).toBeCloseTo(percentAt(v, day('2026-10-05')))
    expect(box.width).toBeCloseTo((2 / 21) * 100)
  })

  it('draws a plan with one date as one day, and nothing for no dates', () => {
    expect(planBox(v, '2026-10-05', null)!.width).toBeCloseTo((1 / 21) * 100)
    expect(planBox(v, null, null)).toBeNull()
  })

  it('clips a plan that runs past the range, and says so', () => {
    const box = planBox(v, '2026-09-20', '2026-10-02')!
    expect(box.clippedStart).toBe(true)
    expect(box.clippedEnd).toBe(false)
    expect(box.left).toBe(0)
    expect(planBox(v, '2026-08-01', '2026-08-05')).toBeNull()
  })

  it('draws a run still going up to now', () => {
    const box = sliceBox(v, '2026-10-08T08:00:00Z', null, Date.parse('2026-10-08T10:00:00Z'))!
    expect(box.width).toBeCloseTo((2 / 24 / 21) * 100)
  })
})

describe('dragging @SC-567', () => {
  const plan = { planStart: '2026-10-05', planFinish: '2026-10-07' }

  it('moves both dates together', () => {
    expect(dragPlan(plan, 'move', 2)).toEqual({ planStart: '2026-10-07', planFinish: '2026-10-09' })
    expect(dragPlan(plan, 'move', -7)).toEqual({ planStart: '2026-09-28', planFinish: '2026-09-30' })
  })

  it('moves one end, which never passes the other', () => {
    expect(dragPlan(plan, 'finish', 3)).toEqual({ planStart: '2026-10-05', planFinish: '2026-10-10' })
    expect(dragPlan(plan, 'finish', -9)).toEqual({ planStart: '2026-10-05', planFinish: '2026-10-05' })
    expect(dragPlan(plan, 'start', 9)).toEqual({ planStart: '2026-10-07', planFinish: '2026-10-07' })
  })

  it('treats one date as a one-day plan and writes both', () => {
    expect(dragPlan({ planStart: '2026-10-05', planFinish: null }, 'move', 1)).toEqual({ planStart: '2026-10-06', planFinish: '2026-10-06' })
    expect(dragPlan({ planStart: null, planFinish: null }, 'move', 1)).toBeNull()
  })

  it('turns pixels into whole days', () => {
    const v = viewOver('week', day('2026-09-28'), day('2026-10-19'))
    expect(daysMoved(v, 100, 2100)).toBe(1)
    expect(daysMoved(v, 40, 2100)).toBe(0)
    expect(daysMoved(v, -300, 2100)).toBe(-3)
    expect(daysMoved(v, 100, 0)).toBe(0)
  })

  it('moves a start time by days and keeps its time of day', () => {
    expect(moveStartTime('2026-10-09T09:30:00.000Z', 2).toISOString()).toBe('2026-10-11T09:30:00.000Z')
  })
})
