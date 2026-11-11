import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Timeline } from '../Timeline'
import type { TimelineData } from '../types'

afterEach(cleanup)

const data = (unavailable: string | null) => ({
  lanes: [], tasks: [], epics: [], milestones: [],
  runs: { slices: [], unavailable, truncated: false },
}) as unknown as TimelineData

const draw = (unavailable: string | null) => (
  <Timeline scale="month" show="tasks" onScale={() => {}} onShow={() => {}} data={data(unavailable)} now={new Date('2026-11-11')} layout="grid" onOpenTask={() => {}} />
)

describe('the timeline runs nudge @SC-1942', () => {
  it('sits in a slot that is there before it is needed, so the chart does not move when it comes', () => {
    const { container, rerender } = render(draw(null))
    const slot = container.querySelector('[data-nudge-slot]')
    expect(slot).not.toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    const chartBefore = container.querySelector('[data-testid="timeline-scroller"]')!.previousElementSibling
    rerender(draw('site silent'))
    expect(screen.getByRole('status').textContent).toMatch(/Runs could not be read/)
    expect(container.querySelectorAll('[data-nudge-slot]').length).toBe(1)
    expect(container.querySelector('[data-testid="timeline-scroller"]')!.previousElementSibling).toBe(chartBefore)
  })
})
