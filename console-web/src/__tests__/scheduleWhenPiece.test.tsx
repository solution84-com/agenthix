import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ScheduleWhen } from '../components/ScheduleWhen'
import { doItLabel, later, parseWhen, scheduleRequest, type WhenChoice } from '../components/scheduleChoice'

const NOW = new Date(2030, 9, 15, 12, 0)
const local = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const minutes = (n: number) => local(new Date(NOW.getTime() + n * 60_000))

afterEach(cleanup)

describe('choosing a time @SC-909', () => {
  it('now needs no time', () => {
    expect(parseWhen({ mode: 'now', at: '' }, NOW)).toEqual({ ok: true, at: null })
  })
  it('a set time becomes an instant, when it leaves room for the notice', () => {
    const r = parseWhen({ mode: 'later', at: minutes(120) }, NOW)
    expect(r).toEqual({ ok: true, at: new Date(NOW.getTime() + 120 * 60_000).toISOString() })
  })
  it('refuses no time, a time that is not one, and one too near for members to be told', () => {
    const tooNear = 'Choose a time at least 5 minutes from now, so members get notice first.'
    expect(parseWhen({ mode: 'later', at: '' }, NOW)).toEqual({ ok: false, error: 'Choose the date and time.' })
    expect(parseWhen({ mode: 'later', at: 'soon' }, NOW)).toEqual({ ok: false, error: 'Choose the date and time.' })
    expect(parseWhen({ mode: 'later', at: minutes(-30) }, NOW)).toEqual({ ok: false, error: tooNear })
    expect(parseWhen({ mode: 'later', at: minutes(4) }, NOW)).toEqual({ ok: false, error: tooNear })
    expect(parseWhen({ mode: 'later', at: minutes(5) }, NOW).ok).toBe(true)
  })
  it('starts at the next whole hour tomorrow-ish: never in the past, never inside the lead', () => {
    const choice = later(NOW)
    expect(choice.mode).toBe('later')
    expect(parseWhen(choice, NOW).ok).toBe(true)
  })
  it('wraps a change as a scheduled one only when there is a time', () => {
    const change = { op: 'suspend', target: 'site' } as const
    expect(scheduleRequest(change, null)).toEqual(change)
    expect(scheduleRequest(change, '2030-10-16T01:00:00.000Z')).toEqual({ op: 'schedule', at: '2030-10-16T01:00:00.000Z', change })
  })
})

describe('When: now, or at a time @SC-909', () => {
  function Harness({ error }: { error?: string }) {
    const [value, setValue] = useState<WhenChoice>({ mode: 'now', at: '' })
    return <><ScheduleWhen value={value} onChange={setValue} error={error} /><output>{value.mode}:{value.at}</output></>
  }
  it('offers both, and asks for the time only when scheduling', () => {
    render(<Harness />)
    expect(screen.getByText('When')).toBeTruthy()
    expect((screen.getByLabelText('Now') as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByLabelText('Date and time')).toBeNull()
    fireEvent.click(screen.getByLabelText('At a time…'))
    expect(screen.getByLabelText('Date and time')).toBeTruthy()
    expect(screen.getByText(/Members whose work it affects see a notice from now/)).toBeTruthy()
  })
  it('says in one line what Now does, and what members see of a time', () => {
    render(<Harness />)
    expect(screen.getByText('It starts as soon as you confirm.')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('At a time…'))
    expect(screen.queryByText('It starts as soon as you confirm.')).toBeNull()
  })
  it('the one button\'s words follow it: Do it now, or Schedule for the day and time', () => {
    expect(doItLabel({ mode: 'now', at: '' }, NOW)).toBe('Do it now')
    expect(doItLabel({ mode: 'later', at: '2030-10-19T02:00' }, NOW)).toBe('Schedule for Sat 02:00')
    expect(doItLabel({ mode: 'later', at: '2030-10-30T02:00' }, NOW)).toBe('Schedule for Wed 30 Oct 02:00')
    expect(doItLabel({ mode: 'later', at: '' }, NOW)).toBe('Schedule')
  })
  it('shows the sentence beside the time when it is wrong', () => {
    render(<Harness error="Choose the date and time." />)
    fireEvent.click(screen.getByLabelText('At a time…'))
    expect(screen.getByText('Choose the date and time.')).toBeTruthy()
  })
})
