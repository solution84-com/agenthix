import { describe, it, expect } from 'vitest'
import type { RunRow } from '@agenthix/core'
import { narrowsRuns, parseRunsFilters, runMatches, taskKeyOf } from '../screenFilters'

const NOW = new Date('2026-10-09T12:00:00.000Z').getTime()
const run = (status: RunRow['status'], startedAt: string) => ({ status, startedAt, createdAt: startedAt }) as RunRow

describe('the Runs screen\'s filters @SC-530 @SC-648', () => {
  it('keeps what is known and drops the rest', () => {
    expect(parseRunsFilters({ relation: 'behalf', when: 'week', ended: 'failed', place: ' WEB ', search: '  x  ', agentId: 5, extra: 1, conversationId: ' c1 ' }))
      .toEqual({ relation: 'behalf', when: 'week', ended: 'failed', place: 'WEB', agentId: undefined, search: 'x', conversationId: 'c1' })
    expect(parseRunsFilters({ relation: 'everyone', when: 'forever' })).toMatchObject({ relation: undefined, when: undefined })
    expect(parseRunsFilters(undefined)).toEqual({})
  })

  it('says when a filter reads the run\'s own record', () => {
    expect(narrowsRuns({})).toBe(false)
    expect(narrowsRuns({ when: 'any', ended: 'any' })).toBe(false)
    expect(narrowsRuns({ ended: 'stopped' })).toBe(true)
  })

  it('matches a run by when it happened and how it ended', () => {
    const recent = run('COMPLETED', '2026-10-09T08:00:00.000Z')
    const old = run('FAILED', '2026-09-01T08:00:00.000Z')
    expect(runMatches(recent, { when: 'day' }, NOW)).toBe(true)
    expect(runMatches(old, { when: 'month' }, NOW)).toBe(false)
    expect(runMatches(old, { ended: 'failed' }, NOW)).toBe(true)
    expect(runMatches(recent, { ended: 'failed' }, NOW)).toBe(false)
    expect(runMatches(run('CANCELLED', '2026-10-09T08:00:00.000Z'), { ended: 'stopped' }, NOW)).toBe(true)
    expect(runMatches(old, {}, NOW)).toBe(true)
  })

  it('reads a task key out of a search', () => {
    expect(taskKeyOf('web-27')).toEqual({ key: 'WEB', number: 27 })
    expect(taskKeyOf('footer links')).toBeNull()
  })
})
