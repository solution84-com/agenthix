import { describe, expect, it } from 'vitest'
import { nextCronTime, nextCronTimes, parseCron, routineScheduleProblem, type CronRule } from '../cron.js'

function rule(cron: string): CronRule {
  const parsed = parseCron(cron)
  if (!parsed.ok) throw new Error(parsed.problem)
  return parsed.rule
}

const iso = (ds: Date[]) => ds.map(d => d.toISOString())

describe('reading a cron rule', () => {
  it('reads lists, ranges, steps and names', () => {
    expect(rule('0,30 9-17/4 * JAN-MAR mon-fri')).toMatchObject({
      minutes: [0, 30], hours: [9, 13, 17], daysOfMonth: null, months: [1, 2, 3],
      weekdays: { days: [1, 2, 3, 4, 5], nth: [], last: [] }, everyHour: false,
    })
    expect(rule('15 * * * *').everyHour).toBe(true)
    expect(rule('0 0 * * 7').weekdays?.days).toEqual([0])
    expect(rule('5/20 0 * * *').minutes).toEqual([5, 25, 45])
  })

  it('reads the nth and the last weekday of the month', () => {
    expect(rule('0 9 * * 1#1').weekdays).toEqual({ days: [], nth: [{ day: 1, n: 1 }], last: [] })
    expect(rule('0 9 * * FRIL').weekdays).toEqual({ days: [], nth: [], last: [5] })
  })

  it('says what is wrong, field by field', () => {
    const problem = (c: string) => (parseCron(c) as { ok: false; problem: string }).problem
    expect(problem('* * * *')).toMatch(/five fields/)
    expect(problem('60 * * * *')).toMatch(/minute 60 is out of range/i)
    expect(problem('0 25 * * *')).toMatch(/hour 25/i)
    expect(problem('0 9 * * 1#6')).toMatch(/at most five/)
    expect(problem('0 9 5-1 * *')).toMatch(/backwards/)
    expect(problem('0 9 */0 * *')).toMatch(/step/)
    expect(problem('a b c d e')).toMatch(/is not a minute/)
    expect(problem('0 0 30 2 *')).toMatch(/never comes/)
    expect(problem('x'.repeat(200))).toMatch(/at most/)
  })
})

describe('the 5-minute floor', () => {
  it('refuses a step under 5 minutes, in the words the control shows', () => {
    expect(routineScheduleProblem('*/2 * * * *', 'UTC')).toBe('Every 2 minutes is too often: a routine runs at most every 5 minutes')
    expect(routineScheduleProblem('* * * * *', 'UTC')).toMatch(/Every 1 minute is too often/)
  })

  it('refuses times too close across the hour and across midnight', () => {
    expect(routineScheduleProblem('2,58 * * * *', 'UTC')).toMatch(/4 minutes apart/)
    expect(routineScheduleProblem('0 0,23 * * *', 'UTC')).toBeNull()
    expect(routineScheduleProblem('58 23 * * *', 'UTC')).toBeNull()
    expect(routineScheduleProblem('0,58 0,23 * * *', 'UTC')).toMatch(/2 minutes apart/)
    // Midnight is only crossed when two days running fire: Monday 23:58 and Monday 00:00 are a week apart.
    expect(routineScheduleProblem('0,58 0,23 * * 1', 'UTC')).toBeNull()
  })

  it('takes every 5 minutes, and steps that do not divide the hour when far enough apart', () => {
    expect(routineScheduleProblem('*/5 * * * *', 'UTC')).toBeNull()
    expect(routineScheduleProblem('*/7 * * * *', 'UTC')).toMatch(/4 minutes apart/)
  })

  it('refuses a timezone that is not one', () => {
    expect(routineScheduleProblem('0 9 * * *', 'Mars/Olympus')).toMatch(/not a timezone/)
  })
})

describe('the next times', () => {
  it('gives the next three in the rule\'s timezone, strictly after now', () => {
    const now = new Date('2026-11-07T00:46:00Z') // Friday 11:46 in Sydney
    expect(iso(nextCronTimes(rule('0 9 * * 1-5'), 'Australia/Sydney', now, 3))).toEqual([
      // Monday 9, Tuesday 10 and Wednesday 11 November, 09:00 in Sydney (UTC+11).
      '2026-11-08T22:00:00.000Z', '2026-11-09T22:00:00.000Z', '2026-11-10T22:00:00.000Z',
    ])
    const at = new Date('2026-11-08T22:00:00Z')
    expect(nextCronTime('0 9 * * 1-5', 'Australia/Sydney', at)?.toISOString()).toBe('2026-11-09T22:00:00.000Z')
  })

  it('takes either day field when both are restricted, as cron does', () => {
    const times = nextCronTimes(rule('0 12 1 * 5'), 'UTC', new Date('2026-11-25T00:00:00Z'), 3)
    expect(iso(times)).toEqual(['2026-11-27T12:00:00.000Z', '2026-12-01T12:00:00.000Z', '2026-12-04T12:00:00.000Z'])
  })

  it('finds the first Monday and the last Friday of the month', () => {
    expect(iso(nextCronTimes(rule('0 9 * * 1#1'), 'UTC', new Date('2026-11-07T00:00:00Z'), 2)))
      .toEqual(['2026-12-07T09:00:00.000Z', '2027-01-04T09:00:00.000Z'])
    expect(iso(nextCronTimes(rule('0 9 * * 5L'), 'UTC', new Date('2026-11-07T00:00:00Z'), 2)))
      .toEqual(['2026-11-27T09:00:00.000Z', '2026-12-25T09:00:00.000Z'])
  })

  it('finds 29 February years ahead', () => {
    expect(nextCronTime('0 0 29 2 *', 'UTC', new Date('2026-03-01T00:00:00Z'))?.toISOString()).toBe('2028-02-29T00:00:00.000Z')
  })

  it('returns nothing for a rule it cannot read', () => {
    expect(nextCronTime('nope', 'UTC', new Date())).toBeNull()
    expect(nextCronTime('0 9 * * *', 'Nowhere/Else', new Date())).toBeNull()
  })
})

describe('clock changes', () => {
  // New York: 8 March 2026 jumps 02:00 → 03:00; 1 November 2026 falls back 02:00 → 01:00.
  const NY = 'America/New_York'

  it('a skipped time fires as a clock that skipped it reads, that much later', () => {
    const times = nextCronTimes(rule('30 2 * * *'), NY, new Date('2026-03-07T12:00:00Z'), 3)
    // 7 Mar 02:30 has passed; 8 Mar 02:30 does not exist and fires at 03:30 EDT (07:30Z); 9 Mar 02:30 EDT.
    expect(iso(times)).toEqual(['2026-03-08T07:30:00.000Z', '2026-03-09T06:30:00.000Z', '2026-03-10T06:30:00.000Z'])
  })

  it('a skipped time that lands on another of the rule\'s times fires once', () => {
    const times = nextCronTimes(rule('30 2,3 * * *'), NY, new Date('2026-03-08T05:00:00Z'), 2)
    expect(iso(times)).toEqual(['2026-03-08T07:30:00.000Z', '2026-03-09T06:30:00.000Z'])
  })

  it('a time passed twice fires once, the first time, when the hour is named', () => {
    const times = nextCronTimes(rule('30 1 * * *'), NY, new Date('2026-11-01T04:00:00Z'), 2)
    expect(iso(times)).toEqual(['2026-11-01T05:30:00.000Z', '2026-11-02T06:30:00.000Z'])
  })

  it('a time passed twice fires both times when the hour is *', () => {
    const times = nextCronTimes(rule('30 * * * *'), NY, new Date('2026-11-01T04:45:00Z'), 3)
    // 00:30 EDT is 04:30Z (passed); 01:30 EDT 05:30Z; 01:30 EST 06:30Z; 02:30 EST 07:30Z.
    expect(iso(times)).toEqual(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z', '2026-11-01T07:30:00.000Z'])
  })

  it('a firing a half-hour clock change brings within the floor of the one before is skipped', () => {
    // Lord Howe jumps 02:00 → 02:30 on 4 October 2026: 02:02 moves on to 02:32, two minutes after 02:30, and is skipped;
    // 03:02 and 03:30 follow.
    const times = nextCronTimes(rule('2,30 * * * *'), 'Australia/Lord_Howe', new Date('2026-10-03T15:00:00Z'), 3)
    expect(times.map(t => t.toISOString())).toEqual(["2026-10-03T15:30:00.000Z", "2026-10-03T16:02:00.000Z", "2026-10-03T16:30:00.000Z"])
  })

  it('never brings two firings closer than the floor', () => {
    for (const cron of ['*/5 * * * *', '*/5 1-3 * * *', '2,30 * * * *', '0,30 2 * * *']) {
      for (const [from, zone] of [['2026-03-08T04:00:00Z', NY], ['2026-10-31T23:00:00Z', NY], ['2026-10-03T14:00:00Z', 'Australia/Lord_Howe']] as const) {
        const times = nextCronTimes(rule(cron), zone, new Date(from), 60)
        for (let i = 1; i < times.length; i++) {
          expect(times[i].getTime() - times[i - 1].getTime(), `${cron} in ${zone} at ${times[i].toISOString()}`).toBeGreaterThanOrEqual(5 * 60_000)
        }
      }
    }
  })
})
