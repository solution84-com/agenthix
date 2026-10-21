import { describe, it, expect } from 'vitest'
import { roundsSummary, ruleSentence, tookText, zoneLabel, routineStartWords } from '@agenthix/ui/tasks'

describe('a routine in words @SC-684', () => {
  it('says when it repeats as the start of a sentence', () => {
    expect(ruleSentence({ kind: 'weekly', time: '09:00', weekdays: [5, 1, 2, 3, 4] })).toBe('Every weekday at 9:00')
    expect(ruleSentence({ kind: 'weekly', time: '10:00', weekdays: [1] })).toBe('Every Monday at 10:00')
    expect(ruleSentence({ kind: 'weekly', time: '17:30', weekdays: [1, 3, 5] })).toBe('Every Mon, Wed and Fri at 17:30')
    expect(ruleSentence({ kind: 'weekly', time: '08:00', weekdays: [0, 1, 2, 3, 4, 5, 6] })).toBe('Every day at 8:00')
    expect(ruleSentence({ kind: 'interval', every: 2, unit: 'hours' })).toBe('Every 2 hours')
    expect(ruleSentence({ kind: 'interval', every: 1, unit: 'days' }, { at: '2026-10-01T23:00:00Z', timezone: 'Australia/Sydney' })).toBe('Every day at 9:00')
  })

  it('names a time zone by its place', () => {
    expect(zoneLabel('Australia/Sydney')).toBe('Sydney time')
    expect(zoneLabel('America/New_York')).toBe('New York time')
    expect(zoneLabel('UTC')).toBe('UTC')
  })

  it('counts the last rounds in words, leaving out what is not there', () => {
    expect(roundsSummary(['done', 'done', 'failed', 'needsYou', 'waiting'])).toBe('Last 5: 2 done · 1 failed · 1 needs you · 1 waiting')
    expect(roundsSummary([])).toBe('No rounds yet')
  })

  it('says how long a run took', () => {
    expect(tookText(42_000)).toBe('42 s')
    expect(tookText(360_000)).toBe('6 min')
    expect(tookText(3_900_000)).toBe('1 h 5 min')
    expect(tookText(null)).toBe('—')
  })

  it('says whether a round starts at its time or waits for a person (adr-0104)', () => {
    expect(routineStartWords('Frontend dev')).toBe("At each round's time, Frontend dev starts it, whatever column it is in.")
    expect(routineStartWords(null)).toBe('With no agent, each round waits for a person to start it.')
  })
})
