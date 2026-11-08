import { describe, expect, it } from 'vitest'
import { cronOfPreset, describeSchedule, presetOfCron, presetProblem, zoneWords, type SchedulePreset } from '../cronWords.js'
import { routineScheduleProblem } from '../cron.js'

describe('presets', () => {
  const presets: Array<[SchedulePreset, string]> = [
    [{ kind: 'everyMinutes', every: 15 }, '*/15 * * * *'],
    [{ kind: 'everyHours', every: 1, minute: 0 }, '0 * * * *'],
    [{ kind: 'everyHours', every: 6, minute: 30 }, '30 */6 * * *'],
    [{ kind: 'daily', times: ['03:00'] }, '0 3 * * *'],
    [{ kind: 'weekdays', times: ['09:00', '15:00'] }, '0 9,15 * * 1-5'],
    [{ kind: 'weekly', days: [3, 1], times: ['09:00'] }, '0 9 * * 1,3'],
    [{ kind: 'monthlyDay', day: 1, times: ['07:00'] }, '0 7 1 * *'],
    [{ kind: 'monthlyWeekday', which: 'first', weekday: 1, times: ['09:00'] }, '0 9 * * 1#1'],
    [{ kind: 'monthlyWeekday', which: 'last', weekday: 5, times: ['17:00'] }, '0 17 * * 5L'],
  ]

  it('each writes a cron rule that saves, and the rule selects the preset again', () => {
    for (const [preset, cron] of presets) {
      expect(cronOfPreset(preset)).toBe(cron)
      expect(routineScheduleProblem(cron, 'UTC')).toBeNull()
      const back = presetOfCron(cron)
      expect(back?.kind, cron).toBe(preset.kind)
    }
  })

  it('refuses what cron cannot say, on the control', () => {
    expect(presetProblem({ kind: 'everyMinutes', every: 2 })).toBe('2 is too often: a routine runs at most every 5 minutes')
    expect(presetProblem({ kind: 'everyMinutes', every: 7 })).toMatch(/does not divide the hour/)
    expect(presetProblem({ kind: 'everyHours', every: 5, minute: 0 })).toMatch(/does not divide the day/)
    expect(presetProblem({ kind: 'weekdays', times: ['09:00', '15:30'] })).toMatch(/share their minutes/)
    expect(presetProblem({ kind: 'daily', times: ['9am'] })).toMatch(/HH:MM/)
    expect(presetProblem({ kind: 'weekly', days: [], times: ['09:00'] })).toMatch(/at least one day/)
    expect(cronOfPreset({ kind: 'everyMinutes', every: 2 })).toBeNull()
  })

  it('leaves to Advanced a rule no preset says', () => {
    expect(presetOfCron('0 9 1,15 * *')).toBeNull()
    expect(presetOfCron('0 9 * 1 *')).toBeNull()
    expect(presetOfCron('*/7 * * * *')).toBeNull()
  })
})

describe('read back in words', () => {
  it('says presets as people would', () => {
    expect(describeSchedule('0 9 * * 1-5', 'Australia/Sydney')).toBe('At 09:00, Monday to Friday, Sydney time')
    expect(describeSchedule('0 3 * * *', 'Australia/Sydney')).toBe('At 03:00 every day, Sydney time')
    expect(describeSchedule('0 9,15 * * 1-5', 'Europe/London')).toBe('At 09:00 and 15:00, Monday to Friday, London time')
    expect(describeSchedule('0 9 * * 1#1', 'UTC')).toBe('At 09:00 on the first Monday of the month, UTC')
    expect(describeSchedule('*/15 * * * *', 'UTC')).toBe('Every 15 minutes, UTC')
    expect(describeSchedule('0 * * * *', 'UTC')).toBe('Every hour, on the hour, UTC')
    expect(describeSchedule('0 7 1 * *', 'UTC')).toBe('At 07:00 on the 1st of every month, UTC')
    expect(describeSchedule('0 7 31 * *', 'UTC')).toBe('At 07:00 on the 31st of every month, in the months that have one, UTC')
    expect(describeSchedule('0 10 * * 0,6', 'America/New_York')).toBe('At 10:00 on Saturday and Sunday, New York time')
  })

  it('says any other rule field by field', () => {
    expect(describeSchedule('0 9 1,15 * 5', 'UTC')).toBe('At 09:00 on day 1 and 15 of the month or on Friday, UTC')
    expect(describeSchedule('0,30 9-17 * * *', 'UTC')).toBe('At minutes 0 and 30 past hours 9, 10, 11, 12, 13, 14, 15, 16 and 17, UTC')
    expect(describeSchedule('0 9 * 1,7 *', 'UTC')).toBe('At 09:00 in January and July, UTC')
    expect(describeSchedule('nope', 'UTC')).toBeNull()
  })

  it('names a timezone by its city', () => {
    expect(zoneWords('America/Argentina/Buenos_Aires')).toBe('Buenos Aires time')
    expect(zoneWords('Etc/UTC')).toBe('UTC')
  })
})
