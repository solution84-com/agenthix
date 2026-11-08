import { describe, expect, it } from 'vitest'
import { choose, draftOf, draftProblem, oneMoreTime, readBack, withCron, withPreset } from '../scheduleDraft'
import { nextRunLine } from '../routineWords'

describe('the schedule builder @SC-RT1', () => {
  it('selects the preset a rule says, with its fields filled', () => {
    const d = draftOf('0 9,15 * * 1-5', 'Europe/London')
    expect(d.chosen).toBe('weekdays')
    expect(d.presets.weekdays).toEqual({ kind: 'weekdays', times: ['09:00', '15:00'] })
  })

  it('leaves a rule only Advanced can say with no preset chosen', () => {
    expect(draftOf('0 9 1-7 * 1', 'UTC').chosen).toBeNull()
  })

  it('writes a chosen or changed preset into Advanced', () => {
    const d = draftOf('0 2 * * *', 'UTC')
    expect(withPreset(d, { kind: 'daily', times: ['03:00'] }).cron).toBe('0 3 * * *')
    expect(choose(d, 'weekly').cron).toBe('0 9 * * 1')
    expect(choose(d, 'monthlyWeekday').cron).toBe('0 9 * * 1#1')
  })

  it('selects a preset when a rule it says is typed under Advanced', () => {
    const d = withCron(draftOf('0 9 * * 1-5', 'UTC'), '*/15 * * * *')
    expect(d.chosen).toBe('everyMinutes')
    expect(d.presets.everyMinutes).toEqual({ kind: 'everyMinutes', every: 15 })
  })

  it('refuses more often than every 5 minutes, on the control that says it', () => {
    const preset = withPreset(draftOf('0 9 * * *', 'UTC'), { kind: 'everyMinutes', every: 2 })
    expect(draftProblem(preset)).toEqual({ on: 'preset', text: '2 is too often: a routine runs at most every 5 minutes.' })
    expect(preset.cron).toBe('0 9 * * *')
    expect(draftProblem(withCron(draftOf('0 9 * * *', 'UTC'), '*/2 * * * *'))?.on).toBe('cron')
  })

  it('reads the schedule back with its next three times', () => {
    const back = readBack({ cron: '0 3 * * *', timezone: 'Australia/Sydney' }, new Date('2026-11-07T00:46:00Z'))
    expect(back?.words).toBe('At 03:00 every day, Sydney time')
    expect(back?.next.map(d => d.toISOString())).toEqual(['2026-11-07T16:00:00.000Z', '2026-11-08T16:00:00.000Z', '2026-11-09T16:00:00.000Z'])
    expect(readBack({ cron: 'nonsense', timezone: 'UTC' }, new Date())).toBeNull()
  })

  it('adds a time an hour after the last, keeping its minutes', () => {
    expect(oneMoreTime(['09:00'])).toEqual(['09:00', '10:00'])
    expect(oneMoreTime(['23:30'])).toEqual(['23:30', '00:30'])
  })

  it("says, before saving, when it runs next or that it will not", () => {
    const r = { id: 'r', title: 'Scan', onBehalfOf: { userId: 'kai', username: 'Kai' }, enabled: true, cron: '0 2 * * *', timezone: 'UTC' }
    const now = new Date('2026-11-07T11:46:00Z')
    expect(nextRunLine(r, { cron: '0 3 * * *' }, now)).toBe('It runs next at 03:00 on Sun 8 Nov.')
    expect(nextRunLine(r, { enabled: false }, now)).toBe('It will not run again until someone switches it on.')
  })
})
