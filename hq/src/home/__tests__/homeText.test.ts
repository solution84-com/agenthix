import { describe, it, expect } from 'vitest'
import { greeting, endOfLocalDay, signalLabels } from '../homeText'

describe('greeting @SC-509', () => {
  it('greets by the time of day', () => {
    expect(greeting(new Date(2026, 9, 6, 5, 0), 'Avery')).toBe('Good morning, Avery')
    expect(greeting(new Date(2026, 9, 6, 11, 59), 'Avery')).toBe('Good morning, Avery')
    expect(greeting(new Date(2026, 9, 6, 12, 0), 'Avery')).toBe('Good afternoon, Avery')
    expect(greeting(new Date(2026, 9, 6, 17, 59), 'Avery')).toBe('Good afternoon, Avery')
    expect(greeting(new Date(2026, 9, 6, 18, 0), 'Avery')).toBe('Good evening, Avery')
    expect(greeting(new Date(2026, 9, 6, 2, 0), 'Avery')).toBe('Good evening, Avery')
  })

  it('greets without a name when there is none', () => {
    expect(greeting(new Date(2026, 9, 6, 14, 0), null)).toBe('Good afternoon')
  })
})

describe('endOfLocalDay @SC-509', () => {
  it('is the last moment of the same local day', () => {
    const end = endOfLocalDay(new Date(2026, 9, 6, 14, 30))
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours(), end.getMinutes()]).toEqual([2026, 9, 6, 23, 59])
  })
})

describe('signalLabels @SC-509', () => {
  it('counts each signal in words, singular and plural', () => {
    expect(signalLabels({ notificationsNeedingYou: 3, agentsAtWork: 3, comingUpToday: 2 })).toEqual({
      notifications: '3 notifications need you',
      runs: '3 running',
      comingUp: '2 coming up today',
    })
    expect(signalLabels({ notificationsNeedingYou: 1, agentsAtWork: 1, comingUpToday: 1 })).toEqual({
      notifications: '1 notification needs you',
      runs: '1 running',
      comingUp: '1 coming up today',
    })
  })

  it('says plainly when there is nothing', () => {
    expect(signalLabels({ notificationsNeedingYou: 0, agentsAtWork: 0, comingUpToday: 0 })).toEqual({
      notifications: 'Nothing needs you',
      runs: 'Nothing running',
      comingUp: 'Nothing coming up today',
    })
  })
})
